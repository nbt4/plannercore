package lifecycle

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"plannercore/internal/auth"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const planA = "11111111-1111-4111-8111-111111111111"
const planB = "22222222-2222-4222-8222-222222222222"
const bucketA = "33333333-3333-4333-8333-333333333333"
const labelA = "44444444-4444-4444-8444-444444444444"

type fixture struct {
	t       *testing.T
	db      *sql.DB
	router  *gin.Engine
	user    uint
	handler *Handler
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	dsn := os.Getenv("PLANNERCORE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("isolated _test PostgreSQL required")
	}
	u, e := url.Parse(dsn)
	if e != nil || !strings.HasSuffix(u.Path, "_test") {
		t.Fatal("dedicated _test database required")
	}
	sum := sha256.Sum256([]byte(t.Name()))
	ns := "planner_lifecycle_" + hex.EncodeToString(sum[:6])
	q := u.Query()
	q.Set("search_path", ns)
	u.RawQuery = q.Encode()
	db, e := sql.Open("pgx", u.String())
	if e != nil {
		t.Fatal(e)
	}
	db.SetMaxOpenConns(5)
	f := &fixture{t: t, db: db, user: 1}
	f.exec("CREATE SCHEMA " + ns)
	t.Cleanup(func() { db.Exec("DROP SCHEMA " + ns + " CASCADE"); db.Close() })
	for _, path := range []string{"../../migrations/postgresql/003_plannercore_schema.sql", "../../migrations/postgresql/004_task_recurrence.sql"} {
		raw, e := os.ReadFile(path)
		if e != nil {
			t.Fatal(e)
		}
		f.exec(string(raw))
	}
	f.exec(`CREATE TABLE users(userid INT PRIMARY KEY,is_active BOOL,is_admin BOOL,username TEXT);INSERT INTO users VALUES(1,true,false,'Member'),(2,true,true,'OtherAdmin'),(3,true,false,'Colleague')`)
	f.exec(`INSERT INTO planner_plans(id,name,created_by) VALUES($1,'Own plan','1'),($2,'Private other plan','2')`, planA, planB)
	f.exec(`INSERT INTO planner_members VALUES($1,'1','owner'),($1,'3','member'),($2,'2','owner')`, planA, planB)
	f.exec(`INSERT INTO planner_buckets(id,plan_id,name) VALUES($1,$2,'Audio')`, bucketA, planA)
	f.exec(`INSERT INTO planner_labels(id,plan_id,name,color) VALUES($1,$2,'Important','#112233')`, labelA, planA)
	for i := 0; i < 2; i++ {
		if e = EnsureSchema(db); e != nil {
			t.Fatal(e)
		}
	}
	t.Setenv("CORES_JWT_SECRET", strings.Repeat("planner-test-secret-", 3))
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user", &auth.User{UserID: f.user})
		c.Set("userIDStr", fmt.Sprint(f.user))
	})
	f.handler = &Handler{db: db}
	r.POST("/:entity/:operation", f.handler.Change)
	r.POST("/native/:entity/:operation", func(c *gin.Context) {
		f.handler.Native(c, c.Param("entity"), c.Param("operation"))
		if !c.IsAborted() {
			v, _ := c.Get("planner_result")
			c.JSON(200, v)
		}
	})
	f.router = r
	return f
}
func (f *fixture) exec(q string, args ...any) {
	f.t.Helper()
	if _, e := f.db.Exec(q, args...); e != nil {
		f.t.Fatal(e)
	}
}
func (f *fixture) count(table string) int {
	f.t.Helper()
	var n int
	if e := f.db.QueryRow("SELECT count(*) FROM " + table).Scan(&n); e != nil {
		f.t.Fatal(e)
	}
	return n
}
func (f *fixture) call(kind, op string, in map[string]any, key string) (int, map[string]any) {
	f.t.Helper()
	raw, _ := json.Marshal(in)
	req := httptest.NewRequest("POST", "/"+kind+"/"+op, bytes.NewReader(raw))
	req.Header.Set("X-Cores-Origin", "MCP/AI")
	req.Header.Set("Idempotency-Key", key)
	action := op
	if op == "restore" {
		action = "archive"
	}
	signed, e := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"uid": f.user, "mcp_scope": "cores:planner:" + action, "exp": time.Now().Add(time.Minute).Unix()}).SignedString([]byte(os.Getenv("CORES_JWT_SECRET")))
	if e != nil {
		f.t.Fatal(e)
	}
	req.AddCookie(&http.Cookie{Name: "cores_token", Value: signed})
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	out := map[string]any{}
	if e = json.Unmarshal(w.Body.Bytes(), &out); e != nil {
		f.t.Fatal(w.Code, w.Body.String())
	}
	return w.Code, out
}
func confirm(f *fixture, kind, op string, in map[string]any) map[string]any {
	f.t.Helper()
	s, p := f.call(kind, op, in, "")
	if s != 200 || p["ready_to_execute"] != true {
		f.t.Fatal("preview", kind, op, s, p)
	}
	out := clone(in)
	for _, k := range []string{"creation_id", "expected_updated_at", "expected_plan_updated_at", "expected_context", "effective_at"} {
		if v := p[k]; v != nil && v != "" {
			out[k] = v
		}
	}
	out["confirmation_text"] = p["required_confirmation_text"]
	if op == "create" {
		out["confirm_creation"] = true
	} else {
		out["confirm_change"] = true
	}
	return out
}
func createTask(f *fixture) string {
	f.t.Helper()
	in := confirm(f, "tasks", "create", map[string]any{"plan_id": planA, "title": "Synthetic task", "bucket_id": bucketA})
	s, p := f.call("tasks", "create", in, "planner-create-task-initial")
	if s != 201 {
		f.t.Fatal(s, p)
	}
	return p["record"].(map[string]any)["id"].(string)
}
func TestPlannerLifecycleCreateUpdateArchiveRestoreAtomicReplay(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	patch := map[string]any{"plan_id": planA, "task_id": id, "title": "New title", "rich_text_notes": "Business note", "priority": "important", "recurrence": "weekly", "assignee_ids": []string{"3"}, "label_ids": []string{labelA}, "start_date": "2026-11-01T10:00:00Z", "due_date": "2026-11-02T10:00:00Z", "checklist": []map[string]any{{"title": "Pack", "is_completed": true, "position": 0}, {"title": "Inspect", "is_completed": false, "position": 1}}}
	for _, op := range []string{"update", "archive", "restore"} {
		input := map[string]any{"plan_id": planA, "task_id": id}
		if op == "update" {
			input = patch
		}
		in := confirm(f, "tasks", op, input)
		before := f.count("planner_mutation_events")
		if s, _ := f.call("tasks", op, in, ""); s != 428 {
			t.Fatal("key", s)
		}
		bad := clone(in)
		bad["confirmation_text"] = "YES"
		if s, _ := f.call("tasks", op, bad, "planner-wrong-phrase-"+op); s != 428 {
			t.Fatal("phrase", s)
		}
		s, p := f.call("tasks", op, in, "planner-lifecycle-"+op)
		if s != 200 {
			t.Fatal(s, p)
		}
		record := p["record"].(map[string]any)
		if record["title"] != "New title" || record["progress"] != float64(50) || record["updated_at"] == in["expected_updated_at"] || (record["archived_at"] != nil) != (op == "archive") {
			t.Fatal(record)
		}
		if s, p = f.call("tasks", op, in, "planner-lifecycle-"+op); s != 200 || f.count("planner_mutation_events") != before+1 {
			t.Fatal("duplicate replay", s, p)
		}
	}
	if f.count("planner_task_history") != 4 {
		t.Fatal("atomic history", f.count("planner_task_history"))
	}
	f.user = 2
	if s, _ := f.call("tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "title": "Hidden"}, ""); s != 403 {
		t.Fatal("admin bypass", s)
	}
}
func TestPlannerLifecyclePlanRetentionCurrentMembershipAndDuplicates(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	update := confirm(f, "plans", "update", map[string]any{"plan_id": planA, "name": "Changed plan", "description": "", "is_favorite": true, "is_template": true, "background_color": "#abcdef"})
	if s, p := f.call("plans", "update", update, "planner-plan-update"); s != 200 {
		t.Fatal(s, p)
	}
	for _, op := range []string{"archive", "restore"} {
		in := confirm(f, "plans", op, map[string]any{"plan_id": planA})
		if s, p := f.call("plans", op, in, "planner-plan-"+op); s != 200 {
			t.Fatal(s, p)
		}
		if op == "archive" {
			if _, e := f.db.Exec(`UPDATE planner_tasks SET title='forbidden' WHERE id=$1`, id); e == nil {
				t.Fatal("archived parent mutable")
			}
		}
	}
	in := confirm(f, "tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "title": "Final"})
	if s, p := f.call("tasks", "update", in, "planner-member-replay"); s != 200 {
		t.Fatal(s, p)
	}
	f.exec(`DELETE FROM planner_members WHERE plan_id=$1 AND user_id='1'`, planA)
	if s, _ := f.call("tasks", "update", in, "planner-member-replay"); s != 403 {
		t.Fatal("revoked member replay", s)
	}
	f.exec(`INSERT INTO planner_members VALUES($1,'1','owner')`, planA)
	if s, p := f.call("tasks", "create", map[string]any{"plan_id": planA, "title": "Final"}, ""); s != 200 || p["ready_to_execute"] != false {
		t.Fatal("duplicate", s, p)
	}
	create := confirm(f, "plans", "create", map[string]any{"name": "New plan", "description": "All retained"})
	s, p := f.call("plans", "create", create, "planner-new-plan")
	if s != 201 {
		t.Fatal(s, p)
	}
	newPlan := p["record"].(map[string]any)["id"]
	f.exec(`DELETE FROM planner_members WHERE plan_id=$1 AND user_id='1'`, newPlan)
	if s, _ := f.call("plans", "create", create, "planner-new-plan"); s != 403 {
		t.Fatal("result plan membership replay", s)
	}
}
func TestPlannerLifecycleRecurringCompletionAtomicNextTask(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	in := confirm(f, "tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "recurrence": "weekly", "due_date": "2026-11-02T10:00:00Z", "assignee_ids": []string{"3"}, "status": "completed"})
	before := f.count("planner_tasks")
	s, p := f.call("tasks", "update", in, "planner-recurrence-once")
	if s != 200 {
		t.Fatal(s, p)
	}
	next := p["next_task"].(map[string]any)
	if next["due_date"] != "2026-11-09T10:00:00+00:00" && next["due_date"] != "2026-11-09T10:00:00Z" {
		t.Fatal(next)
	}
	if f.count("planner_tasks") != before+1 || len(next["assignee_ids"].([]any)) != 1 || next["completed_at"] != nil {
		t.Fatal("next occurrence", next)
	}
	if s, p = f.call("tasks", "update", in, "planner-recurrence-once"); s != 200 || f.count("planner_tasks") != before+1 {
		t.Fatal("duplicate recurrence", s, p)
	}
}
func TestPlannerLifecycleCreateCompletedRecurrence(t *testing.T) {
	f := newFixture(t)
	in := confirm(f, "tasks", "create", map[string]any{"plan_id": planA, "title": "Completed recurring import", "status": "completed", "recurrence": "daily", "due_date": "2026-11-02T10:00:00Z"})
	before := f.count("planner_tasks")
	status, result := f.call("tasks", "create", in, "planner-create-completed")
	if status != 201 || result["next_task"] == nil || f.count("planner_tasks") != before+2 {
		t.Fatal(status, result)
	}
	if status, result = f.call("tasks", "create", in, "planner-create-completed"); status != 201 || f.count("planner_tasks") != before+2 {
		t.Fatal("replay", status, result)
	}
}

func TestPlannerLifecycleRollbackVersionsGuardsAndForeignReferences(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	patch := map[string]any{"plan_id": planA, "task_id": id, "title": "Changed"}
	in := confirm(f, "tasks", "update", patch)
	f.exec(`INSERT INTO planner_comments(task_id,user_id,content) VALUES($1,'1','Private comment never returned in drafts')`, id)
	if s, p := f.call("tasks", "update", in, "planner-stale-child"); s != 200 || p["ready_to_execute"] != false {
		t.Fatal("child version", s, p)
	}
	in = confirm(f, "tasks", "update", patch)
	f.exec(`CREATE FUNCTION fail_planner_event() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'synthetic audit rollback';END $$ LANGUAGE plpgsql;CREATE TRIGGER fail_planner BEFORE INSERT ON planner_mutation_events FOR EACH ROW EXECUTE FUNCTION fail_planner_event()`)
	before := f.count("planner_mutation_receipts")
	if s, _ := f.call("tasks", "update", in, "planner-audit-rollback"); s != 500 {
		t.Fatal(s)
	}
	var title string
	f.db.QueryRow(`SELECT title FROM planner_tasks WHERE id=$1`, id).Scan(&title)
	if title != "Synthetic task" || f.count("planner_mutation_receipts") != before {
		t.Fatal("partial write", title)
	}
	f.exec(`DROP TRIGGER fail_planner ON planner_mutation_events`)
	for _, q := range []string{`DELETE FROM planner_tasks WHERE id=$1`, `UPDATE planner_tasks SET plan_id='22222222-2222-4222-8222-222222222222' WHERE id=$1`} {
		if _, e := f.db.Exec(q, id); e == nil {
			t.Fatal("retention guard", q)
		}
	}
	f.exec(`INSERT INTO planner_labels(id,plan_id,name,color) VALUES('55555555-5555-4555-8555-555555555555',$1,'Hidden label','#112233')`, planB)
	if s, p := f.call("tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "label_ids": []string{"55555555-5555-4555-8555-555555555555"}}, ""); s != 200 || p["ready_to_execute"] != false || strings.Contains(fmt.Sprint(p), "Hidden label") {
		t.Fatal("foreign label", s, p)
	}
}
func TestPlannerLifecycleBusyLocksAndSchemaParity(t *testing.T) {
	f := newFixture(t)
	raw, e := os.ReadFile("../../migrations/postgresql/005_plan_task_lifecycle.sql")
	if e != nil || string(raw) != SchemaSQL {
		t.Fatal("migration differs", e)
	}
	in := confirm(f, "plans", "update", map[string]any{"plan_id": planA, "name": "New"})
	tx, e := f.db.Begin()
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`SELECT id FROM planner_plans WHERE id=$1 FOR UPDATE`, planA); e != nil {
		t.Fatal(e)
	}
	start := time.Now()
	if s, _ := f.call("plans", "update", in, "planner-row-lock-conflict"); s != 409 || time.Since(start) > time.Second {
		t.Fatal("reverse wait", s, time.Since(start))
	}
	if !validUUID(uuid.NewString()) {
		t.Fatal("UUID validation")
	}
}

func TestPlannerLifecycleNativeRelationsRollbackAndExplicitStaleVersion(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	f.router.PUT("/ui/tasks/:taskId", func(c *gin.Context) {
		f.handler.Native(c, "tasks", "update")
		if !c.IsAborted() {
			v, _ := c.Get("planner_result")
			c.JSON(200, v)
		}
	})
	f.router.POST("/ui/tasks/:taskId/checklist", func(c *gin.Context) { f.handler.NativeRelation(c, "checklist", "create") })
	f.router.PATCH("/ui/checklist/:id", func(c *gin.Context) { f.handler.NativeRelation(c, "checklist", "update") })
	f.router.DELETE("/ui/checklist/:id", func(c *gin.Context) { f.handler.NativeRelation(c, "checklist", "delete") })
	f.router.POST("/ui/tasks/:taskId/assignees", func(c *gin.Context) { f.handler.NativeRelation(c, "assignee", "create") })
	ui := func(method, path, body string) (int, map[string]any) {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		f.router.ServeHTTP(w, r)
		out := map[string]any{}
		if json.Unmarshal(w.Body.Bytes(), &out) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		return w.Code, out
	}
	old, e := snapshotReadVersion(f, id)
	if e != nil {
		t.Fatal(e)
	}
	in := confirm(f, "tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "title": "Latest"})
	if s, p := f.call("tasks", "update", in, "planner-native-intervening"); s != 200 {
		t.Fatal(s, p)
	}
	if s, p := ui("PUT", "/ui/tasks/"+id, fmt.Sprintf(`{"title":"Old","expectedUpdatedAt":%q}`, old)); s != 409 {
		t.Fatal("native stale version", s, p)
	}
	if s, p := ui("POST", "/ui/tasks/"+id+"/assignees", `{"userId":"2"}`); s != 409 {
		t.Fatal("native foreign assignee", s, p)
	}
	if _, e := f.db.Exec(`INSERT INTO planner_task_assignees(task_id,user_id) VALUES($1,'2')`, id); e == nil {
		t.Fatal("legacy assignee bypass")
	}
	s, p := ui("POST", "/ui/tasks/"+id+"/checklist", `{"title":"Native item"}`)
	if s != 201 {
		t.Fatal(s, p)
	}
	item := p["id"].(string)
	s, p = ui("PATCH", "/ui/checklist/"+item, `{"isCompleted":true}`)
	if s != 200 {
		t.Fatal(s, p)
	}
	var progress, total int
	f.db.QueryRow(`SELECT progress,checklist_total_count FROM planner_tasks WHERE id=$1`, id).Scan(&progress, &total)
	if progress != 100 || total != 1 {
		t.Fatal(progress, total)
	}
	f.exec(`CREATE FUNCTION fail_native_planner() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'synthetic native audit rollback';END $$ LANGUAGE plpgsql;CREATE TRIGGER fail_native_planner BEFORE INSERT ON planner_mutation_events FOR EACH ROW EXECUTE FUNCTION fail_native_planner()`)
	before := f.count("planner_checklist_items")
	if s, _ := ui("POST", "/ui/tasks/"+id+"/checklist", `{"title":"Rollback"}`); s != 500 || f.count("planner_checklist_items") != before {
		t.Fatal("partial native checklist create", s)
	}
	if s, _ := ui("DELETE", "/ui/checklist/"+item, ""); s != 500 || f.count("planner_checklist_items") != before {
		t.Fatal("partial native checklist delete", s)
	}
}
func snapshotReadVersion(f *fixture, id string) (string, error) {
	var v string
	e := f.db.QueryRow(`SELECT to_char(updated_at AT TIME ZONE 'UTC',`+versionSQL+`) FROM planner_tasks WHERE id=$1`, id).Scan(&v)
	return v, e
}
func TestPlannerLifecycleAssigneeNowaitAndNormalizedChecklistIDs(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	tx, e := f.db.Begin()
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`UPDATE users SET is_active=false WHERE userid=3`); e != nil {
		t.Fatal(e)
	}
	start := time.Now()
	if s, p := f.call("tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "assignee_ids": []string{"3"}}, ""); s != 409 || time.Since(start) > time.Second {
		t.Fatal("assignee lock classification", s, p, time.Since(start))
	}
	tx.Rollback()
	duplicate := uuid.NewSHA1(uuid.NameSpaceOID, []byte(id+"/checklist/0/First")).String()
	if s, p := f.call("tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "checklist": []map[string]any{{"title": "First", "is_completed": true, "position": 0}, {"id": duplicate, "title": "Second", "is_completed": false, "position": 1}}}, ""); s != 400 {
		t.Fatal("normalized ID collision", s, p)
	}
}
func TestPlannerLifecycleRecurrenceAndHistoryFailureRollback(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	in := confirm(f, "tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "recurrence": "daily", "assignee_ids": []string{"3"}, "status": "completed"})
	f.exec(`CREATE FUNCTION fail_planner_history() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'synthetic history rollback';END $$ LANGUAGE plpgsql;CREATE TRIGGER fail_planner_history BEFORE INSERT ON planner_task_history FOR EACH ROW EXECUTE FUNCTION fail_planner_history()`)
	beforeTasks, beforeEvents, beforeReceipts := f.count("planner_tasks"), f.count("planner_mutation_events"), f.count("planner_mutation_receipts")
	if s, _ := f.call("tasks", "update", in, "planner-recurring-history-fail"); s != 500 {
		t.Fatal(s)
	}
	if f.count("planner_tasks") != beforeTasks || f.count("planner_mutation_events") != beforeEvents || f.count("planner_mutation_receipts") != beforeReceipts {
		t.Fatal("partial recurrence after history failure")
	}
	var complete bool
	f.db.QueryRow(`SELECT completed_at IS NOT NULL FROM planner_tasks WHERE id=$1`, id).Scan(&complete)
	if complete {
		t.Fatal("completion escaped rollback")
	}
}
func TestPlannerLifecycleDelegatedBoundaryAndBounds(t *testing.T) {
	f := newFixture(t)
	r := gin.New()
	r.Use(DelegationBoundary())
	r.GET("/api/v1/planner/users", func(c *gin.Context) { c.JSON(200, gin.H{"private": "must not leak"}) })
	for _, claim := range []any{"cores:planner:update", nil, 123} {
		signed, e := jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.MapClaims{"mcp_scope": claim, "uid": 1, "exp": time.Now().Add(time.Minute).Unix()}).SignedString([]byte(auth.JWTSecret()))
		if e != nil {
			t.Fatal(e)
		}
		for _, bearer := range []bool{false, true} {
			req := httptest.NewRequest("GET", "/api/v1/planner/users", nil)
			if bearer {
				req.Header.Set("Authorization", "Bearer "+signed)
			} else {
				req.AddCookie(&http.Cookie{Name: "cores_token", Value: signed})
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != 403 || strings.Contains(w.Body.String(), "must not leak") {
				t.Fatal("delegated native bypass", w.Code)
			}
		}
	}
	for _, input := range []map[string]any{{"plan_id": planA, "title": nil}, {"plan_id": planA, "title": strings.Repeat("ä", 501)}, {"plan_id": planA, "title": "Known", "progress": 75}, {"plan_id": planA, "title": "Known", "bucket_id": bucketA, "clear_fields": []string{"bucket_id"}}} {
		if s, p := f.call("tasks", "create", input, ""); s != 400 {
			t.Fatal("closed validation", s, p)
		}
	}
}

func TestPlannerLifecycleActiveDependenciesAndArchivedChildFreeze(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	next := confirm(f, "tasks", "create", map[string]any{"plan_id": planA, "title": "Successor"})
	s, p := f.call("tasks", "create", next, "planner-successor-create")
	if s != 201 {
		t.Fatal(s, p)
	}
	successor := p["record"].(map[string]any)["id"]
	f.exec(`INSERT INTO planner_dependencies(predecessor_id,successor_id) VALUES($1,$2)`, id, successor)
	if s, p := f.call("tasks", "archive", map[string]any{"plan_id": planA, "task_id": id}, ""); s != 200 || p["ready_to_execute"] != false {
		t.Fatal("live dependency", s, p)
	}
	complete := confirm(f, "tasks", "update", map[string]any{"plan_id": planA, "task_id": successor, "status": "completed"})
	if s, p := f.call("tasks", "update", complete, "planner-successor-complete"); s != 200 {
		t.Fatal(s, p)
	}
	in := confirm(f, "tasks", "archive", map[string]any{"plan_id": planA, "task_id": id})
	if s, p := f.call("tasks", "archive", in, "planner-freeze-archive"); s != 200 {
		t.Fatal(s, p)
	}
	for _, q := range []string{`UPDATE planner_tasks SET title='archived edit' WHERE id=$1`, `INSERT INTO planner_comments(task_id,user_id,content) VALUES($1,'1','forbidden')`, `INSERT INTO planner_task_assignees(task_id,user_id) VALUES($1,'3')`, `DELETE FROM planner_dependencies WHERE predecessor_id=$1`} {
		if _, e := f.db.Exec(q, id); e == nil {
			t.Fatal("archived child mutable", q)
		}
	}
	if _, e := f.db.Exec(`DELETE FROM planner_mutation_events`); e == nil {
		t.Fatal("event history mutable")
	}
}
func TestPlannerLifecycleTwoConnectionReplayAndReverseChildLocks(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	in := confirm(f, "tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "title": "Concurrent once"})
	events := f.count("planner_mutation_events")
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s, _ := f.call("tasks", "update", in, "planner-samekey-concurrent")
			codes <- s
		}()
	}
	wg.Wait()
	close(codes)
	for s := range codes {
		if s != 200 {
			t.Fatal("same-key concurrency", s)
		}
	}
	if f.count("planner_mutation_events") != events+1 {
		t.Fatal("duplicate event")
	}
	// A native child can hold its task while the owner holds/needs the parent;
	// NOWAIT resolves this collision without waiting for the reverse lock order.
	tx, e := f.db.Begin()
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`SELECT id FROM planner_tasks WHERE id=$1 FOR UPDATE`, id); e != nil {
		t.Fatal(e)
	}
	start := time.Now()
	if s, _ := f.call("tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "title": "Blocked"}, ""); s != 409 || time.Since(start) > time.Second {
		t.Fatal("reverse child wait", s, time.Since(start))
	}
}
func TestPlannerLifecycleBusyStartupBoundAndInactiveUserReplay(t *testing.T) {
	f := newFixture(t)
	id := createTask(f)
	in := confirm(f, "tasks", "update", map[string]any{"plan_id": planA, "task_id": id, "title": "Inactive replay"})
	if s, p := f.call("tasks", "update", in, "planner-inactive-replay"); s != 200 {
		t.Fatal(s, p)
	}
	f.exec(`UPDATE users SET is_active=false WHERE userid=1`)
	if s, _ := f.call("tasks", "update", in, "planner-inactive-replay"); s != 403 {
		t.Fatal("inactive replay", s)
	}
	tx, e := f.db.Begin()
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`LOCK TABLE planner_tasks IN ACCESS EXCLUSIVE MODE`); e != nil {
		t.Fatal(e)
	}
	started := time.Now()
	if e = EnsureSchema(f.db); e == nil || time.Since(started) > 7*time.Second {
		t.Fatal("unbounded startup", e, time.Since(started))
	}
}
