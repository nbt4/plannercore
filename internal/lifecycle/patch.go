package lifecycle

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

func patchDraft(in *Request, draft map[string]any, kind, op string, anchor time.Time) error {
	if op == "archive" {
		draft["archived_at"] = "on_confirmed_execution"
		return nil
	}
	if op == "restore" {
		draft["archived_at"] = nil
		return nil
	}
	for _, v := range []struct {
		k string
		v *string
	}{{"name", in.Name}, {"description", in.Description}, {"background_color", in.BackgroundColor}, {"title", in.Title}, {"rich_text_notes", in.RichTextNotes}, {"priority", in.Priority}, {"recurrence", in.Recurrence}, {"bucket_id", in.BucketID}} {
		if v.v != nil {
			value := *v.v
			if v.k == "title" || v.k == "name" {
				value = strings.TrimSpace(value)
			}
			draft[v.k] = value
		}
	}
	for _, v := range []struct {
		k string
		v *bool
	}{{"is_favorite", in.IsFavorite}, {"is_template", in.IsTemplate}} {
		if v.v != nil {
			draft[v.k] = *v.v
		}
	}
	if in.Position != nil {
		draft["position"] = *in.Position
	}
	for _, v := range []struct {
		k string
		v *string
	}{{"start_date", in.StartDate}, {"due_date", in.DueDate}} {
		if v.v != nil {
			t, _ := time.Parse(time.RFC3339Nano, *v.v)
			draft[v.k] = t.UTC().Format(time.RFC3339Nano)
		}
	}
	for _, f := range in.ClearFields {
		draft[f] = nil
	}
	if kind == "plans" {
		return nil
	}
	for _, v := range []struct {
		k string
		v *[]string
	}{{"assignee_ids", in.AssigneeIDs}, {"label_ids", in.LabelIDs}} {
		if v.v != nil {
			ids := append([]string{}, (*v.v)...)
			sort.Strings(ids)
			draft[v.k] = ids
		}
	}
	if in.Checklist != nil {
		items := append([]Checklist{}, (*in.Checklist)...)
		for i := range items {
			if items[i].ID == "" {
				items[i].ID = uuid.NewSHA1(uuid.NameSpaceOID, []byte(draft["id"].(string)+"/checklist/"+fmt.Sprint(i)+"/"+items[i].Title)).String()
			}
		}
		seen := map[string]bool{}
		for _, item := range items {
			if seen[item.ID] {
				return fmt.Errorf("Normalized checklist IDs must be distinct")
			}
			seen[item.ID] = true
		}
		sort.Slice(items, func(i, j int) bool {
			if items[i].Position == items[j].Position {
				return items[i].ID < items[j].ID
			}
			return items[i].Position < items[j].Position
		})
		encoded, _ := json.Marshal(items)
		var rows []any
		json.Unmarshal(encoded, &rows)
		draft["checklist"] = rows
	}
	// Progress remains derived; status/completion is independent as in the native application.
	raw, _ := json.Marshal(draft["checklist"])
	var items []Checklist
	if e := json.Unmarshal(raw, &items); e != nil {
		return e
	}
	completed := 0
	for _, i := range items {
		if i.IsCompleted {
			completed++
		}
	}
	draft["checklist_total_count"] = len(items)
	draft["checklist_completed_count"] = completed
	draft["progress"] = 0
	if len(items) > 0 {
		draft["progress"] = int(math.Floor(float64(completed) * 100 / float64(len(items))))
	}
	if in.Status != nil {
		switch *in.Status {
		case "completed":
			if draft["completed_at"] == nil {
				draft["completed_at"] = anchor.Format(time.RFC3339Nano)
			}
		case "not-started":
			if in.StartDate != nil {
				return fmt.Errorf("Not-started status cannot set start_date")
			}
			draft["completed_at"] = nil
			draft["start_date"] = nil
		case "in-progress":
			draft["completed_at"] = nil
			if draft["start_date"] == nil {
				draft["start_date"] = anchor.Format(time.RFC3339Nano)
			}
		}
	}
	if draft["start_date"] != nil && draft["due_date"] != nil {
		s, e := time.Parse(time.RFC3339Nano, draft["start_date"].(string))
		if e != nil {
			return e
		}
		d, e := time.Parse(time.RFC3339Nano, draft["due_date"].(string))
		if e != nil {
			return e
		}
		if d.Before(s) {
			return fmt.Errorf("Due date must not precede start date")
		}
	}
	return nil
}
func values(m map[string]any, k string) []string {
	raw, _ := json.Marshal(m[k])
	out := []string{}
	json.Unmarshal(raw, &out)
	return out
}

type referenceIssue string

func (e referenceIssue) Error() string { return string(e) }

func validateReferences(tx *sql.Tx, draft map[string]any) error {
	plan, id := draft["plan_id"], draft["id"]
	if draft["bucket_id"] != nil {
		var valid bool
		if e := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM planner_buckets WHERE id=$1 AND plan_id=$2)`, draft["bucket_id"], plan).Scan(&valid); e != nil {
			return e
		}
		if !valid {
			return referenceIssue("bucket_must_belong_to_plan")
		}
	}
	for _, user := range values(draft, "assignee_ids") {
		var active bool
		e := tx.QueryRow(`SELECT u.is_active FROM planner_members m JOIN users u ON u.userid::text=m.user_id WHERE m.plan_id=$1 AND m.user_id=$2 FOR SHARE OF u NOWAIT`, plan, user).Scan(&active)
		if e != nil && !errors.Is(e, sql.ErrNoRows) {
			return e
		}
		if e != nil || !active {
			return referenceIssue("assignees_must_be_active_plan_members")
		}
	}
	for _, label := range values(draft, "label_ids") {
		var valid bool
		if e := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM planner_labels WHERE id=$1 AND plan_id=$2)`, label, plan).Scan(&valid); e != nil {
			return e
		}
		if !valid {
			return referenceIssue("labels_must_belong_to_plan")
		}
	}
	raw, _ := json.Marshal(draft["checklist"])
	var items []Checklist
	json.Unmarshal(raw, &items)
	for _, item := range items {
		var owned bool
		if e := tx.QueryRow(`SELECT NOT EXISTS(SELECT 1 FROM planner_checklist_items WHERE id=$1 AND task_id<>$2)`, item.ID, id).Scan(&owned); e != nil {
			return e
		}
		if !owned {
			return referenceIssue("checklist_item_belongs_to_another_task")
		}
	}
	return nil
}
func workflowContext(tx *sql.Tx, kind, plan, id, user string) (map[string]any, error) {
	out := map[string]any{}
	queries := []struct{ k, q string }{{"members", `SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'is_active',u.is_active) ORDER BY m.user_id),'[]'::jsonb) FROM (SELECT * FROM planner_members WHERE plan_id=$1 ORDER BY user_id LIMIT 1001)m LEFT JOIN users u ON u.userid::text=m.user_id`}, {"buckets", `SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'position',position,'color',color) ORDER BY id),'[]'::jsonb) FROM (SELECT * FROM planner_buckets WHERE plan_id=$1 ORDER BY id LIMIT 1001)x`}, {"labels", `SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color) ORDER BY id),'[]'::jsonb) FROM (SELECT * FROM planner_labels WHERE plan_id=$1 ORDER BY id LIMIT 1001)x`}, {"tasks", `SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'bucket_id',bucket_id,'updated_at',to_char(updated_at AT TIME ZONE 'UTC',` + versionSQL + `),'archived_at',archived_at,'completed_at',completed_at) ORDER BY id),'[]'::jsonb) FROM (SELECT id,bucket_id,updated_at,archived_at,completed_at FROM planner_tasks WHERE plan_id=$1 ORDER BY id LIMIT 1001)x`}}
	for _, q := range queries {
		rows, e := array(tx, q.q, plan)
		if e != nil {
			return nil, e
		}
		if len(rows) > 1000 {
			return nil, referenceIssue("Planner context exceeds1000 records; reduce scope first")
		}
		out[q.k] = rows
	}
	// Cross-plan legacy dependencies are retained but their foreign identities are never disclosed.
	counts, e := object(tx, `SELECT jsonb_build_object('comments',(SELECT count(*) FROM planner_comments x JOIN planner_tasks t ON t.id=x.task_id WHERE t.plan_id=$1),'attachments',(SELECT count(*) FROM planner_attachments x JOIN planner_tasks t ON t.id=x.task_id WHERE t.plan_id=$1),'active_sprints',(SELECT count(*) FROM planner_sprints WHERE plan_id=$1 AND is_active),'goals',(SELECT count(*) FROM planner_goals WHERE plan_id=$1),'custom_fields',(SELECT count(*) FROM planner_custom_fields WHERE plan_id=$1),'baselines',(SELECT count(*) FROM planner_baselines WHERE plan_id=$1),'links',(SELECT count(*) FROM planner_plan_links WHERE plan_id=$1),'dependencies',(SELECT count(*) FROM planner_dependencies d JOIN planner_tasks a ON a.id=d.predecessor_id JOIN planner_tasks b ON b.id=d.successor_id WHERE a.plan_id=$1 OR b.plan_id=$1))`, plan)
	if e != nil {
		return nil, e
	}
	out["retained_counts"] = counts
	return out, nil
}
func duplicateContext(tx *sql.Tx, kind, plan, id string, draft map[string]any, user string) ([]any, error) {
	if kind == "plans" {
		return array(tx, `SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'is_archived',p.archived_at IS NOT NULL,'updated_at',p.updated_at) ORDER BY p.id),'[]'::jsonb) FROM (SELECT p.* FROM planner_plans p JOIN planner_members m ON m.plan_id=p.id AND m.user_id=$3 WHERE p.id<>$1 AND lower(trim(p.name))=lower(trim($2)) ORDER BY p.id LIMIT 101)p`, id, draft["name"], user)
	}
	return array(tx, `SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'is_archived',archived_at IS NOT NULL,'updated_at',updated_at) ORDER BY id),'[]'::jsonb) FROM (SELECT id,title,archived_at,updated_at FROM planner_tasks WHERE plan_id=$1 AND id<>$2 AND lower(trim(title))=lower(trim($3)) ORDER BY id LIMIT 101)x`, plan, id, draft["title"])
}
func nextOccurrence(draft, current map[string]any, kind, op string, anchor time.Time) (map[string]any, error) {
	if kind != "tasks" || (op != "update" && op != "create") || current["completed_at"] != nil || draft["completed_at"] == nil || draft["recurrence"] == "none" {
		return nil, nil
	}
	recurrence, _ := draft["recurrence"].(string)
	if !map[string]bool{"daily": true, "weekly": true, "monthly": true}[recurrence] {
		return nil, fmt.Errorf("Known recurrence required before completion")
	}
	base := anchor
	if draft["due_date"] != nil {
		var e error
		base, e = time.Parse(time.RFC3339Nano, draft["due_date"].(string))
		if e != nil {
			return nil, e
		}
	}
	switch recurrence {
	case "daily":
		base = base.AddDate(0, 0, 1)
	case "weekly":
		base = base.AddDate(0, 0, 7)
	case "monthly":
		base = base.AddDate(0, 1, 0)
	}
	next := map[string]any{"id": uuid.NewSHA1(uuid.NameSpaceOID, []byte(fmt.Sprint(draft["id"], "/", current["updated_at"], "/", draft["completed_at"], "/recurrence"))).String(), "plan_id": draft["plan_id"], "bucket_id": draft["bucket_id"], "title": draft["title"], "priority": draft["priority"], "recurrence": recurrence, "rich_text_notes": "", "start_date": nil, "due_date": base.UTC().Format(time.RFC3339Nano), "completed_at": nil, "progress": 0, "checklist_total_count": 0, "checklist_completed_count": 0, "archived_at": nil, "position": number(draft["position"]) + 1000, "assignee_ids": draft["assignee_ids"], "label_ids": []string{}, "checklist": []any{}}
	return next, nil
}
func number(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	}
	return 0
}
func persist(tx *sql.Tx, kind, op string, draft map[string]any, user string, in *Request) error {
	id, plan := draft["id"], draft["plan_id"]
	if op == "archive" || op == "restore" {
		table := "planner_plans"
		if kind == "tasks" {
			table = "planner_tasks"
		}
		_, e := tx.Exec(`UPDATE `+table+` SET archived_at=CASE WHEN $2 THEN clock_timestamp() ELSE NULL END WHERE id=$1`, id, op == "archive")
		return e
	}
	columns := []string{"name", "description", "background_color", "is_favorite", "is_template"}
	table := "planner_plans"
	if kind == "tasks" {
		table = "planner_tasks"
		columns = []string{"title", "rich_text_notes", "priority", "recurrence", "bucket_id", "position", "start_date", "due_date", "completed_at", "progress", "checklist_completed_count", "checklist_total_count"}
	}
	// Relations are replaced before the primary write so derived counts/final snapshots agree.
	if kind == "tasks" {
		if op == "create" {
			if _, e := tx.Exec(`INSERT INTO planner_tasks(id,plan_id,title,created_by) VALUES($1,$2,$3,$4)`, id, plan, draft["title"], user); e != nil {
				return e
			}
		}
		for _, set := range []struct {
			key, table, col string
			replace         bool
		}{{"assignee_ids", "planner_task_assignees", "user_id", op == "create" || in.AssigneeIDs != nil}, {"label_ids", "planner_task_labels", "label_id", op == "create" || in.LabelIDs != nil}} {
			if set.replace {
				if _, e := tx.Exec(`DELETE FROM `+set.table+` WHERE task_id=$1`, id); e != nil {
					return e
				}
				for _, v := range values(draft, set.key) {
					if _, e := tx.Exec(`INSERT INTO `+set.table+`(task_id,`+set.col+`) VALUES($1,$2)`, id, v); e != nil {
						return e
					}
				}
			}
		}
		if op == "create" || in.Checklist != nil {
			raw, _ := json.Marshal(draft["checklist"])
			var items []Checklist
			json.Unmarshal(raw, &items)
			keep := map[string]bool{}
			for _, v := range items {
				keep[v.ID] = true
				if _, e := tx.Exec(`INSERT INTO planner_checklist_items(id,task_id,title,is_completed,position,completed_by,completed_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $4 THEN $6 ELSE NULL END,CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,is_completed=EXCLUDED.is_completed,position=EXCLUDED.position,completed_by=CASE WHEN planner_checklist_items.is_completed IS DISTINCT FROM EXCLUDED.is_completed THEN EXCLUDED.completed_by ELSE planner_checklist_items.completed_by END,completed_at=CASE WHEN planner_checklist_items.is_completed IS DISTINCT FROM EXCLUDED.is_completed THEN EXCLUDED.completed_at ELSE planner_checklist_items.completed_at END`, v.ID, id, v.Title, v.IsCompleted, v.Position, user); e != nil {
					return e
				}
			}
			rows, e := array(tx, `SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) FROM planner_checklist_items WHERE task_id=$1`, id)
			if e != nil {
				return e
			}
			for _, v := range rows {
				if !keep[v.(string)] {
					if _, e = tx.Exec(`DELETE FROM planner_checklist_items WHERE id=$1 AND task_id=$2`, v, id); e != nil {
						return e
					}
				}
			}
		}
	}
	args := []any{id}
	sets := []string{}
	for _, col := range columns {
		args = append(args, draft[col])
		sets = append(sets, fmt.Sprintf("%s=$%d", col, len(args)))
	}
	if kind == "plans" && op == "create" {
		if _, e := tx.Exec(`INSERT INTO planner_plans(id,name,created_by) VALUES($1,$2,$3)`, id, draft["name"], user); e != nil {
			return e
		}
		if _, e := tx.Exec(`INSERT INTO planner_members(plan_id,user_id,role) VALUES($1,$2,'owner')`, id, user); e != nil {
			return e
		}
	}
	_, e := tx.Exec(`UPDATE `+table+` SET `+strings.Join(sets, ",")+` WHERE id=$1`, args...)
	return e
}
