package lifecycle

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"plannercore/internal/auth"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

type Handler struct {
	db     *sql.DB
	Notify func(plan, task, op, user string)
}

func NewHandler(db *gorm.DB) *Handler { s, _ := db.DB(); return &Handler{db: s} }

type Checklist struct {
	ID          string `json:"id,omitempty"`
	Title       string `json:"title"`
	IsCompleted bool   `json:"is_completed"`
	Position    int    `json:"position"`
}
type Request struct {
	PlanID                string       `json:"plan_id,omitempty"`
	TaskID                string       `json:"task_id,omitempty"`
	CreationID            string       `json:"creation_id,omitempty"`
	Name                  *string      `json:"name,omitempty"`
	Description           *string      `json:"description,omitempty"`
	BackgroundColor       *string      `json:"background_color,omitempty"`
	IsFavorite            *bool        `json:"is_favorite,omitempty"`
	IsTemplate            *bool        `json:"is_template,omitempty"`
	Title                 *string      `json:"title,omitempty"`
	RichTextNotes         *string      `json:"rich_text_notes,omitempty"`
	Priority              *string      `json:"priority,omitempty"`
	Recurrence            *string      `json:"recurrence,omitempty"`
	BucketID              *string      `json:"bucket_id,omitempty"`
	Position              *float64     `json:"position,omitempty"`
	StartDate             *string      `json:"start_date,omitempty"`
	DueDate               *string      `json:"due_date,omitempty"`
	Status                *string      `json:"status,omitempty"`
	AssigneeIDs           *[]string    `json:"assignee_ids,omitempty"`
	LabelIDs              *[]string    `json:"label_ids,omitempty"`
	Checklist             *[]Checklist `json:"checklist,omitempty"`
	ClearFields           []string     `json:"clear_fields,omitempty"`
	AllowDuplicate        bool         `json:"allow_duplicate,omitempty"`
	ExpectedUpdatedAt     string       `json:"expected_updated_at,omitempty"`
	ExpectedPlanUpdatedAt string       `json:"expected_plan_updated_at,omitempty"`
	ExpectedContext       string       `json:"expected_context,omitempty"`
	EffectiveAt           string       `json:"effective_at,omitempty"`
	ConfirmationText      string       `json:"confirmation_text,omitempty"`
	ConfirmCreation       bool         `json:"confirm_creation,omitempty"`
	ConfirmChange         bool         `json:"confirm_change,omitempty"`
	Preview               bool         `json:"preview,omitempty"`
}

var keyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)
var contextPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

const versionSQL = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`
const planRecordSQL = `jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'background_color',p.background_color,'is_favorite',p.is_favorite,'is_template',p.is_template,'created_by',p.created_by,'created_at',p.created_at,'archived_at',p.archived_at,'updated_at',to_char(p.updated_at AT TIME ZONE 'UTC',` + versionSQL + `))`
const taskRecordSQL = `jsonb_build_object('id',t.id,'plan_id',t.plan_id,'bucket_id',t.bucket_id,'title',t.title,'rich_text_notes',t.rich_text_notes,'priority',t.priority,'recurrence',t.recurrence,'progress',t.progress,'start_date',t.start_date,'due_date',t.due_date,'completed_at',t.completed_at,'position',t.position,'checklist_completed_count',t.checklist_completed_count,'checklist_total_count',t.checklist_total_count,'created_by',t.created_by,'created_at',t.created_at,'archived_at',t.archived_at,'updated_at',to_char(t.updated_at AT TIME ZONE 'UTC',` + versionSQL + `))`

func object(tx *sql.Tx, q string, args ...any) (map[string]any, error) {
	var raw []byte
	if e := tx.QueryRow(q, args...).Scan(&raw); e != nil {
		return nil, e
	}
	var out map[string]any
	e := json.Unmarshal(raw, &out)
	return out, e
}
func array(tx *sql.Tx, q string, args ...any) ([]any, error) {
	var raw []byte
	if e := tx.QueryRow(q, args...).Scan(&raw); e != nil {
		return nil, e
	}
	out := []any{}
	e := json.Unmarshal(raw, &out)
	return out, e
}
func fail(c *gin.Context, e error) {
	status := 500
	message := "Planner operation failed"
	if errors.Is(e, sql.ErrNoRows) {
		status = 404
		message = "Record unavailable"
	}
	var pg *pgconn.PgError
	if errors.As(e, &pg) {
		switch pg.Code {
		case "55P03", "40P01", "40001":
			status = 409
			message = "Concurrent change; prepare again"
		case "23503", "23505", "23514":
			status = 409
			message = "Retained lifecycle or reference conflict"
		}
	}
	c.AbortWithStatusJSON(status, gin.H{"error": message})
}
func validUUID(s string) bool {
	v, e := uuid.Parse(s)
	return e == nil && v != uuid.Nil && v.String() == s
}
func clone(m map[string]any) map[string]any {
	n := map[string]any{}
	for k, v := range m {
		n[k] = v
	}
	return n
}
func equal(a, b any) bool { x, _ := json.Marshal(a); y, _ := json.Marshal(b); return bytes.Equal(x, y) }
func snapshot(tx *sql.Tx, kind, id string) (map[string]any, error) {
	if kind == "plans" {
		return object(tx, `SELECT `+planRecordSQL+` FROM planner_plans p WHERE id=$1`, id)
	}
	out, e := object(tx, `SELECT `+taskRecordSQL+` FROM planner_tasks t WHERE id=$1`, id)
	if e != nil {
		return nil, e
	}
	for _, item := range []struct{ key, q string }{{"assignee_ids", `SELECT COALESCE(jsonb_agg(user_id ORDER BY user_id),'[]'::jsonb) FROM planner_task_assignees WHERE task_id=$1`}, {"label_ids", `SELECT COALESCE(jsonb_agg(label_id ORDER BY label_id),'[]'::jsonb) FROM planner_task_labels WHERE task_id=$1`}, {"checklist", `SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'is_completed',is_completed,'position',position) ORDER BY position,id),'[]'::jsonb) FROM planner_checklist_items WHERE task_id=$1`}} {
		out[item.key], e = array(tx, item.q, id)
		if e != nil {
			return nil, e
		}
	}
	return out, nil
}
func audit(tx *sql.Tx, kind, plan, id, user, op, origin string, before, after map[string]any) error {
	old, _ := json.Marshal(before)
	fresh, _ := json.Marshal(after)
	if _, e := tx.Exec(`INSERT INTO planner_mutation_events(plan_id,entity_type,entity_id,user_id,origin,operation,before_values,after_values) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`, plan, strings.TrimSuffix(kind, "s"), id, user, origin, op, string(old), string(fresh)); e != nil {
		return e
	}
	if kind == "tasks" {
		_, e := tx.Exec(`INSERT INTO planner_task_history(task_id,user_id,field_changed,old_value,new_value) VALUES($1,$2,$3,$4,$5)`, id, user, "lifecycle."+op, string(old), string(fresh))
		return e
	}
	return nil
}
func NativeContext(tx *sql.Tx, user, operation string) error {
	_, e := tx.Exec(`SELECT set_config('cores.planner_user',$1,true),set_config('cores.planner_origin','UI',true),set_config('cores.planner_operation',$2,true)`, user, operation)
	return e
}

func (h *Handler) Change(c *gin.Context) {
	kind, op := c.Param("entity"), c.Param("operation")
	if kind != "plans" && kind != "tasks" || !map[string]bool{"create": true, "update": true, "archive": true, "restore": true}[op] {
		c.AbortWithStatusJSON(404, gin.H{"error": "Unknown named Planner workflow"})
		return
	}
	var in Request
	raw, e := io.ReadAll(io.LimitReader(c.Request.Body, 256*1024+1))
	if e != nil || len(raw) > 256*1024 {
		c.AbortWithStatusJSON(400, gin.H{"error": "One bounded workflow object required"})
		return
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if e = d.Decode(&in); e != nil || d.Decode(new(any)) != io.EOF {
		c.AbortWithStatusJSON(400, gin.H{"error": "One closed typed workflow object required"})
		return
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		c.AbortWithStatusJSON(400, gin.H{"error": "Workflow object required"})
		return
	}
	for _, v := range fields {
		if string(v) == "null" {
			c.AbortWithStatusJSON(400, gin.H{"error": "Null is not a patch; omit fields or use clear_fields"})
			return
		}
	}
	cookie, e := c.Cookie("cores_token")
	if e != nil {
		c.AbortWithStatusJSON(403, gin.H{"error": "Signed delegation required"})
		return
	}
	claims := struct {
		UserID uint   `json:"uid"`
		Scope  string `json:"mcp_scope"`
		jwt.RegisteredClaims
	}{}
	token, e := jwt.ParseWithClaims(cookie, &claims, func(*jwt.Token) (any, error) { return []byte(auth.JWTSecret()), nil }, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
	user, _ := c.Get("user")
	actual, ok := user.(*auth.User)
	action := op
	if op == "restore" {
		action = "archive"
	}
	if e != nil || !token.Valid || !ok || actual.UserID == 0 || claims.UserID != actual.UserID || claims.Scope != "cores:planner:"+action || c.GetHeader("X-Cores-Origin") != "MCP/AI" {
		c.AbortWithStatusJSON(403, gin.H{"error": "Real user and selected Planner action required"})
		return
	}
	h.apply(c, kind, op, in, false)
}

func validate(in Request, kind, op string) error {
	for _, v := range []string{in.PlanID, in.TaskID, in.CreationID} {
		if v != "" && !validUUID(v) {
			return fmt.Errorf("Canonical nonzero UUID required")
		}
	}
	if kind == "plans" && (in.TaskID != "" || op == "create" && in.PlanID != "") || kind == "tasks" && (in.PlanID == "" || op != "create" && in.TaskID == "") || op != "create" && kind == "plans" && in.PlanID == "" || op == "create" && in.TaskID != "" {
		return fmt.Errorf("Exact immutable plan/task identity required")
	}
	planFields := in.Name != nil || in.Description != nil || in.BackgroundColor != nil || in.IsFavorite != nil || in.IsTemplate != nil
	taskFields := in.Title != nil || in.RichTextNotes != nil || in.Priority != nil || in.Recurrence != nil || in.BucketID != nil || in.Position != nil || in.StartDate != nil || in.DueDate != nil || in.Status != nil || in.AssigneeIDs != nil || in.LabelIDs != nil || in.Checklist != nil || len(in.ClearFields) > 0
	if kind == "plans" && taskFields || kind == "tasks" && planFields || (op == "archive" || op == "restore") && (planFields || taskFields || in.AllowDuplicate) {
		return fmt.Errorf("Only named entity fields; lifecycle retains every business field")
	}
	for _, v := range []struct {
		p        *string
		max      int
		nonempty bool
	}{{in.Name, 200, true}, {in.Description, 4000, false}, {in.Title, 500, true}, {in.RichTextNotes, 20000, false}} {
		if v.p != nil && (utf8.RuneCountInString(*v.p) > v.max || strings.ContainsRune(*v.p, 0) || v.nonempty && strings.TrimSpace(*v.p) == "") {
			return fmt.Errorf("Bounded nonempty name/title and bounded descriptions/notes required")
		}
	}
	if in.BackgroundColor != nil && !colorPattern.MatchString(*in.BackgroundColor) {
		return fmt.Errorf("Background color must be #RRGGBB")
	}
	if in.Priority != nil && !map[string]bool{"urgent": true, "important": true, "medium": true, "low": true}[*in.Priority] || in.Recurrence != nil && !map[string]bool{"none": true, "daily": true, "weekly": true, "monthly": true}[*in.Recurrence] || in.Status != nil && !map[string]bool{"completed": true, "in-progress": true, "not-started": true}[*in.Status] {
		return fmt.Errorf("Known priority, recurrence and status required")
	}
	if in.Position != nil && (math.IsInf(*in.Position, 0) || math.IsNaN(*in.Position) || math.Abs(*in.Position) > 1e12) {
		return fmt.Errorf("Finite bounded position required")
	}
	if in.BucketID != nil && !validUUID(*in.BucketID) {
		return fmt.Errorf("Exact bucket UUID required; clear_fields unsets it")
	}
	for _, v := range []*string{in.StartDate, in.DueDate} {
		if v != nil {
			if _, e := time.Parse(time.RFC3339Nano, *v); e != nil {
				return fmt.Errorf("RFC3339 dates required")
			}
		}
	}
	seen := map[string]bool{}
	for _, f := range in.ClearFields {
		if !map[string]bool{"bucket_id": true, "start_date": true, "due_date": true}[f] || seen[f] || f == "bucket_id" && in.BucketID != nil || f == "start_date" && in.StartDate != nil || f == "due_date" && in.DueDate != nil {
			return fmt.Errorf("Only distinct omitted nullable fields may be cleared")
		}
		seen[f] = true
	}
	for _, ids := range []*[]string{in.AssigneeIDs, in.LabelIDs} {
		if ids != nil {
			if len(*ids) > 100 {
				return fmt.Errorf("At most100 references per set")
			}
			seen := map[string]bool{}
			for _, id := range *ids {
				if seen[id] {
					return fmt.Errorf("No duplicate references")
				}
				seen[id] = true
				if ids == in.AssigneeIDs {
					n, e := strconv.ParseInt(id, 10, 32)
					if e != nil || n < 1 || strconv.FormatInt(n, 10) != id {
						return fmt.Errorf("Canonical positive suite user IDs required")
					}
				} else if !validUUID(id) {
					return fmt.Errorf("Canonical label UUIDs required")
				}
			}
		}
	}
	if in.Checklist != nil {
		if len(*in.Checklist) > 100 {
			return fmt.Errorf("At most100 checklist items")
		}
		seen := map[string]bool{}
		for _, v := range *in.Checklist {
			if v.ID != "" && (!validUUID(v.ID) || seen[v.ID]) || strings.TrimSpace(v.Title) == "" || utf8.RuneCountInString(v.Title) > 500 || strings.ContainsRune(v.Title, 0) || v.Position < 0 || v.Position > 100000 {
				return fmt.Errorf("Distinct checklist IDs and bounded title/position required")
			}
			seen[v.ID] = true
		}
	}
	return nil
}

func (h *Handler) apply(c *gin.Context, kind, op string, in Request, native bool) {
	if e := validate(in, kind, op); e != nil {
		c.AbortWithStatusJSON(400, gin.H{"error": e.Error()})
		return
	}
	userVal, _ := c.Get("user")
	user, ok := userVal.(*auth.User)
	if !ok || user.UserID == 0 {
		c.AbortWithStatusJSON(403, gin.H{"error": "Interactive user required"})
		return
	}
	actor := strconv.FormatUint(uint64(user.UserID), 10)
	preview := !native && (in.Preview || op == "create" && !in.ConfirmCreation || op != "create" && !in.ConfirmChange)
	tx, e := h.db.BeginTx(c.Request.Context(), nil)
	if e != nil {
		fail(c, e)
		return
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='15s';SET LOCAL TIME ZONE 'UTC'`); e != nil {
		fail(c, e)
		return
	}
	var active bool
	if e = tx.QueryRow(`SELECT is_active FROM users WHERE userid=$1 FOR SHARE`, user.UserID).Scan(&active); e != nil || !active {
		c.AbortWithStatusJSON(403, gin.H{"error": "Current active suite user required"})
		return
	}
	if !(kind == "plans" && op == "create") {
		var role string
		if e = tx.QueryRow(`SELECT role FROM planner_members WHERE plan_id=$1 AND user_id=$2 FOR SHARE`, in.PlanID, actor).Scan(&role); e != nil {
			c.AbortWithStatusJSON(403, gin.H{"error": "Current plan membership required; administrators cannot bypass it"})
			return
		}
	}
	receiptID := int64(0)
	if !preview && !native {
		key := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
		if !keyPattern.MatchString(key) || !contextPattern.MatchString(in.ExpectedContext) {
			c.AbortWithStatusJSON(428, gin.H{"error": "Idempotency key and exact final context required"})
			return
		}
		kh := sha256.Sum256([]byte(key))
		body, _ := json.Marshal(in)
		rh := sha256.Sum256(body)
		keyHash, requestHash := hex.EncodeToString(kh[:]), hex.EncodeToString(rh[:])
		operation := kind + "." + op
		e = tx.QueryRow(`INSERT INTO planner_mutation_receipts(user_id,operation,key_hash,request_hash,plan_id) VALUES($1,$2,$3,$4,NULLIF($5,'')::uuid) ON CONFLICT DO NOTHING RETURNING id`, user.UserID, operation, keyHash, requestHash, in.PlanID).Scan(&receiptID)
		if e == sql.ErrNoRows {
			var previous string
			var response json.RawMessage
			var status int
			if e = tx.QueryRow(`SELECT request_hash,response,status_code FROM planner_mutation_receipts WHERE user_id=$1 AND operation=$2 AND key_hash=$3`, user.UserID, operation, keyHash).Scan(&previous, &response, &status); e != nil {
				fail(c, e)
				return
			}
			if previous != requestHash {
				c.AbortWithStatusJSON(409, gin.H{"error": "Idempotency key binds a different request"})
				return
			}
			// Create-plan receipts must also recheck membership in the resulting plan.
			if kind == "plans" && op == "create" {
				var allowed bool
				if e = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM planner_members WHERE plan_id=$1 AND user_id=$2)`, in.CreationID, actor).Scan(&allowed); e != nil || !allowed {
					c.AbortWithStatusJSON(403, gin.H{"error": "Current result-plan membership required before replay"})
					return
				}
			}
			c.Data(status, "application/json", response)
			return
		}
		if e != nil {
			fail(c, e)
			return
		}
	}
	// All later locks are NOWAIT. Child writers already lock their own rows before touching parents.
	if _, e = tx.Exec(`LOCK TABLE planner_members,planner_buckets,planner_labels,planner_checklist_items,planner_task_assignees,planner_task_labels,planner_dependencies,planner_sprints,planner_sprint_tasks,planner_goals,planner_custom_fields,planner_custom_field_values,planner_comments,planner_attachments,planner_baselines,planner_plan_links,planner_my_day IN SHARE MODE NOWAIT;LOCK TABLE planner_plans,planner_tasks IN SHARE ROW EXCLUSIVE MODE NOWAIT`); e != nil {
		fail(c, e)
		return
	}
	if _, e = tx.Exec(`SELECT set_config('cores.planner_user',$1,true),set_config('cores.planner_origin',$2,true),set_config('cores.planner_operation',$3,true)`, actor, map[bool]string{true: "UI", false: "MCP/AI"}[native], op); e != nil {
		fail(c, e)
		return
	}
	required := []string{}
	if op == "create" && in.CreationID == "" {
		if !preview && !native {
			required = append(required, "creation_id")
		}
		in.CreationID = uuid.NewString()
	}
	id := in.PlanID
	if kind == "tasks" {
		id = in.TaskID
	}
	if op == "create" {
		id = in.CreationID
	}
	if kind == "plans" && op == "create" {
		in.PlanID = id
	}
	var current, plan map[string]any
	if !(kind == "plans" && op == "create") {
		if _, e = tx.Exec(`SELECT id FROM planner_plans WHERE id=$1 FOR UPDATE NOWAIT`, in.PlanID); e != nil {
			fail(c, e)
			return
		}
		plan, e = snapshot(tx, "plans", in.PlanID)
		if e != nil {
			fail(c, e)
			return
		}
	}
	if op != "create" {
		if kind == "tasks" {
			if _, e = tx.Exec(`SELECT id FROM planner_tasks WHERE id=$1 AND plan_id=$2 FOR UPDATE NOWAIT`, id, in.PlanID); e != nil {
				fail(c, e)
				return
			}
		}
		current, e = snapshot(tx, kind, id)
		if e != nil {
			fail(c, e)
			return
		}
		if kind == "tasks" && current["plan_id"] != in.PlanID {
			c.AbortWithStatusJSON(404, gin.H{"error": "Task unavailable in selected plan"})
			return
		}
		if current["archived_at"] != nil && op != "restore" {
			required = append(required, "restore_record_first")
		}
		if current["archived_at"] == nil && op == "restore" {
			required = append(required, "already_active")
		}
	}
	if plan != nil && plan["archived_at"] != nil && !(kind == "plans" && op == "restore") {
		required = append(required, "restore_plan_first")
	}
	{
		for _, v := range []struct {
			key, given string
			actual     any
			needed     bool
		}{{"expected_updated_at", in.ExpectedUpdatedAt, current["updated_at"], op != "create"}, {"expected_plan_updated_at", in.ExpectedPlanUpdatedAt, plan["updated_at"], !(kind == "plans" && op == "create")}} {
			if v.needed && (!preview && !native && v.given == "" || v.given != "" && v.given != v.actual) {
				required = append(required, v.key)
			}
		}
	}
	effective := time.Now().UTC().Truncate(time.Microsecond)
	needsAnchor := kind == "tasks" && in.Status != nil && (*in.Status == "completed" && current["completed_at"] == nil || *in.Status == "in-progress" && current["start_date"] == nil && in.StartDate == nil)
	if in.EffectiveAt != "" {
		anchor, err := time.Parse(time.RFC3339Nano, in.EffectiveAt)
		if err != nil || anchor.After(time.Now().Add(5*time.Second)) || anchor.Before(time.Now().Add(-15*time.Minute)) {
			c.AbortWithStatusJSON(400, gin.H{"error": "Recent valid preview effective_at required"})
			return
		}
		effective = anchor.UTC().Truncate(time.Microsecond)
	} else if needsAnchor && !preview && !native {
		required = append(required, "effective_at")
	}
	draft := clone(current)
	if op == "create" {
		draft = map[string]any{"id": id, "archived_at": nil}
		if kind == "plans" {
			draft["name"] = ""
			draft["description"] = ""
			draft["background_color"] = "#1e293b"
			draft["is_favorite"] = false
			draft["is_template"] = false
		} else {
			draft["plan_id"] = in.PlanID
			draft["bucket_id"] = nil
			draft["title"] = ""
			draft["rich_text_notes"] = ""
			draft["priority"] = "medium"
			draft["recurrence"] = "none"
			draft["start_date"] = nil
			draft["due_date"] = nil
			draft["completed_at"] = nil
			draft["progress"] = 0
			draft["checklist_completed_count"] = 0
			draft["checklist_total_count"] = 0
			draft["assignee_ids"] = []any{}
			draft["label_ids"] = []any{}
			draft["checklist"] = []any{}
			var pos float64
			if e = tx.QueryRow(`SELECT COALESCE(MAX(position),0)+1000 FROM planner_tasks WHERE plan_id=$1 AND archived_at IS NULL AND bucket_id IS NOT DISTINCT FROM $2::uuid`, in.PlanID, in.BucketID).Scan(&pos); e != nil {
				fail(c, e)
				return
			}
			draft["position"] = pos
		}
	}
	if e = patchDraft(&in, draft, kind, op, effective); e != nil {
		c.AbortWithStatusJSON(400, gin.H{"error": e.Error()})
		return
	}
	if op == "create" && (kind == "plans" && draft["name"] == "" || kind == "tasks" && draft["title"] == "") {
		required = append(required, "name_or_title")
	}
	references, e := workflowContext(tx, kind, in.PlanID, id, actor)
	if e != nil {
		var issue referenceIssue
		if errors.As(e, &issue) {
			c.AbortWithStatusJSON(400, gin.H{"error": e.Error()})
			return
		}
		fail(c, e)
		return
	}
	if kind == "tasks" && op != "archive" {
		if e = validateReferences(tx, draft); e != nil {
			var issue referenceIssue
			if errors.As(e, &issue) {
				required = append(required, e.Error())
			} else {
				fail(c, e)
				return
			}
		}
	}
	duplicates, e := duplicateContext(tx, kind, in.PlanID, id, draft, actor)
	if e != nil {
		fail(c, e)
		return
	}
	if (op == "create" || op == "update") && len(duplicates) > 0 && !in.AllowDuplicate {
		required = append(required, "review_duplicates_and_allow_duplicate")
	}
	if len(duplicates) > 100 {
		required = append(required, "bounded_duplicate_context")
	}
	if op == "create" {
		var exists bool
		table := "planner_plans"
		if kind == "tasks" {
			table = "planner_tasks"
		}
		if e = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM `+table+` WHERE id=$1)`, id).Scan(&exists); e != nil {
			fail(c, e)
			return
		}
		if exists {
			required = append(required, "creation_id_unavailable")
		}
	}
	if kind == "tasks" && op == "archive" {
		var blockers int
		if e = tx.QueryRow(`SELECT count(*) FROM planner_dependencies d JOIN planner_tasks t ON t.id=CASE WHEN d.predecessor_id=$1 THEN d.successor_id ELSE d.predecessor_id END JOIN planner_plans p ON p.id=t.plan_id WHERE (d.predecessor_id=$1 OR d.successor_id=$1) AND t.archived_at IS NULL AND p.archived_at IS NULL AND t.completed_at IS NULL`, id).Scan(&blockers); e != nil {
			fail(c, e)
			return
		}
		if blockers > 0 {
			required = append(required, "resolve_active_dependencies_before_archive")
		}
	}
	diff := map[string]any{}
	for k, v := range draft {
		if !equal(v, current[k]) {
			diff[k] = map[string]any{"before": current[k], "after": v}
		}
	}
	if op == "update" && len(diff) == 0 {
		required = append(required, "changed_fields")
	}
	next, e := nextOccurrence(draft, current, kind, op, effective)
	if e != nil {
		c.AbortWithStatusJSON(400, gin.H{"error": e.Error()})
		return
	}
	effects := map[string]any{"retains_all_children": op == "archive" || op == "restore", "next_recurring_task": next, "member_roles_unchanged": !(kind == "plans" && op == "create"), "progress_derived_from_checklist": kind == "tasks", "external_messages_sent": false}
	bound := map[string]any{"entity": kind, "operation": op, "current": current, "plan": plan, "draft": draft, "references": references, "duplicates": duplicates, "allow_duplicate": in.AllowDuplicate, "effects": effects}
	encoded, _ := json.Marshal(bound)
	if len(encoded) > 1024*1024 {
		c.AbortWithStatusJSON(400, gin.H{"error": "Planner context exceeds1MiB; reduce scope first"})
		return
	}
	sum := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(sum[:])
	if in.ExpectedContext != "" && in.ExpectedContext != fingerprint {
		required = append(required, "expected_context")
	}
	phrase := fmt.Sprintf("%s PLANNER %s %s %s", strings.ToUpper(op), strings.ToUpper(strings.TrimSuffix(kind, "s")), id, fingerprint[:16])
	if !preview && !native && len(required) == 0 && in.ConfirmationText != phrase {
		c.AbortWithStatusJSON(428, gin.H{"error": "Exact record/draft-bound confirmation required"})
		return
	}
	result := map[string]any{"operation_status": "confirmation_required", "preview": true, "ready_to_execute": len(required) == 0, "required_fields": required, "current": current, "draft": draft, "diff": diff, "plan": plan, "references": references, "duplicates": duplicates, "effects": effects, "creation_id": in.CreationID, "expected_updated_at": current["updated_at"], "expected_plan_updated_at": plan["updated_at"], "expected_context": fingerprint, "required_confirmation_text": phrase}
	if needsAnchor {
		result["effective_at"] = effective.Format(time.RFC3339Nano)
	}
	if preview || len(required) > 0 {
		if len(required) > 0 {
			result["operation_status"] = "needs_input"
		}
		if native {
			c.AbortWithStatusJSON(409, result)
		} else {
			c.JSON(200, result)
		}
		return
	}
	// Suppress generic primary-trigger audit: one complete final relation-aware event is written below.
	if _, e = tx.Exec(`SELECT set_config('cores.planner_origin','guided',true)`); e != nil {
		fail(c, e)
		return
	}
	if e = persist(tx, kind, op, draft, actor, &in); e != nil {
		fail(c, e)
		return
	}
	if next != nil {
		nextInput := Request{}
		if e = persist(tx, "tasks", "create", next, actor, &nextInput); e != nil {
			fail(c, e)
			return
		}
		fresh, err := snapshot(tx, "tasks", next["id"].(string))
		if err != nil {
			fail(c, err)
			return
		}
		if e = audit(tx, "tasks", in.PlanID, next["id"].(string), actor, "recurrence.create", map[bool]string{true: "UI", false: "MCP/AI"}[native], nil, fresh); e != nil {
			fail(c, e)
			return
		}
		next = fresh
	}
	after, e := snapshot(tx, kind, id)
	if e != nil {
		fail(c, e)
		return
	}
	if e = audit(tx, kind, in.PlanID, id, actor, op, map[bool]string{true: "UI", false: "MCP/AI"}[native], current, after); e != nil {
		fail(c, e)
		return
	}
	finalPlan, e := snapshot(tx, "plans", in.PlanID)
	if e != nil {
		fail(c, e)
		return
	}
	status := 200
	if op == "create" {
		status = 201
	}
	out := map[string]any{"operation_status": map[string]string{"create": "created", "update": "updated", "archive": "archived", "restore": "restored"}[op], "record": after, "plan_updated_at": finalPlan["updated_at"], "next_task": next}
	response, _ := json.Marshal(out)
	if !native {
		if _, e = tx.Exec(`UPDATE planner_mutation_receipts SET response=$2::jsonb,status_code=$3,plan_id=$4 WHERE id=$1`, receiptID, string(response), status, in.PlanID); e != nil {
			fail(c, e)
			return
		}
	}
	if e = tx.Commit(); e != nil {
		fail(c, e)
		return
	}
	if h.Notify != nil && kind == "tasks" {
		h.Notify(in.PlanID, id, op, actor)
		if next != nil {
			h.Notify(in.PlanID, next["id"].(string), "create", actor)
		}
	}
	if native {
		c.Set("planner_result", out)
		return
	}
	c.Data(status, "application/json", response)
}
