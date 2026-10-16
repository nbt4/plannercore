package lifecycle

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"

	"plannercore/internal/auth"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Delegated suite credentials are accepted only at the closed owner endpoints.
// Ordinary sessions and cookies are unchanged. The presence of a signed claim,
// including a malformed/null value, still identifies delegated credentials.
func DelegationBoundary() gin.HandlerFunc {
	return func(c *gin.Context) {
		delegated := strings.EqualFold(c.GetHeader("X-Cores-Origin"), "MCP/AI")
		tokenString, _ := c.Cookie("cores_token")
		if tokenString == "" {
			tokenString = strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		}
		if tokenString != "" {
			token, e := jwt.Parse(tokenString, func(*jwt.Token) (any, error) { return []byte(auth.JWTSecret()), nil }, jwt.WithValidMethods([]string{"HS256", "HS384", "HS512"}), jwt.WithoutClaimsValidation())
			if e == nil && token.Valid {
				if claims, ok := token.Claims.(jwt.MapClaims); ok {
					_, present := claims["mcp_scope"]
					delegated = delegated || present
				}
			}
		}
		if delegated && !strings.HasPrefix(c.Request.URL.Path, "/api/v1/planner/mcp/") {
			c.AbortWithStatusJSON(403, gin.H{"error": "Use named confirmed Planner owner workflows"})
			return
		}
		c.Next()
	}
}
func (h *Handler) Native(c *gin.Context, kind, op string) {
	in := Request{AllowDuplicate: op == "create" || op == "update"}
	if kind == "plans" {
		if op != "create" {
			in.PlanID = c.Param("planId")
		}
	} else {
		if op == "create" {
			in.PlanID = c.Param("planId")
		} else {
			in.TaskID = c.Param("taskId")
			user, _ := c.Get("user")
			u, ok := user.(*auth.User)
			if !ok {
				c.AbortWithStatusJSON(403, gin.H{"error": "Interactive user required"})
				return
			}
			if !validUUID(in.TaskID) {
				c.AbortWithStatusJSON(400, gin.H{"error": "Canonical task UUID required"})
				return
			}
			if e := h.db.QueryRow(`SELECT t.plan_id::text FROM planner_tasks t WHERE t.id=$1 AND EXISTS(SELECT 1 FROM planner_members m WHERE m.plan_id=t.plan_id AND m.user_id=$2)`, in.TaskID, c.GetString("userIDStr")).Scan(&in.PlanID); e != nil {
				_ = u
				fail(c, e)
				return
			}
		}
	}
	if op != "archive" {
		raw, e := io.ReadAll(io.LimitReader(c.Request.Body, 256*1024+1))
		if e != nil || len(raw) > 256*1024 {
			c.AbortWithStatusJSON(400, gin.H{"error": "Bounded native patch required"})
			return
		}
		var input map[string]json.RawMessage
		if json.Unmarshal(raw, &input) != nil || input == nil {
			c.AbortWithStatusJSON(400, gin.H{"error": "Patch object required"})
			return
		}
		fields := map[string]json.RawMessage{}
		aliases := map[string]string{"name": "name", "description": "description", "backgroundColor": "background_color", "isFavorite": "is_favorite", "isTemplate": "is_template", "title": "title", "richTextNotes": "rich_text_notes", "priority": "priority", "recurrence": "recurrence", "bucketId": "bucket_id", "position": "position", "startDate": "start_date", "dueDate": "due_date", "status": "status", "expectedUpdatedAt": "expected_updated_at"}
		for from, to := range aliases {
			if v, ok := input[from]; ok {
				if string(v) == "null" {
					if to == "bucket_id" || to == "start_date" || to == "due_date" {
						in.ClearFields = append(in.ClearFields, to)
						continue
					}
					c.AbortWithStatusJSON(400, gin.H{"error": "Null is only allowed for nullable bucket/dates"})
					return
				}
				fields[to] = v
			}
		}
		encoded, _ := json.Marshal(fields)
		patch := Request{}
		if json.Unmarshal(encoded, &patch) != nil {
			c.AbortWithStatusJSON(400, gin.H{"error": "Typed native patch required"})
			return
		}
		patch.PlanID = in.PlanID
		patch.TaskID = in.TaskID
		patch.AllowDuplicate = in.AllowDuplicate
		patch.ClearFields = in.ClearFields
		in = patch
	}
	h.apply(c, kind, op, in, true)
}

// NativeRelation converts narrow native edits into a complete version-bound
// relation patch, then uses the same atomic owner workflow. A concurrent edit
// invalidates the snapshot before any relation or derived counter is changed.
func (h *Handler) NativeRelation(c *gin.Context, relation, op string) {
	userVal, _ := c.Get("user")
	user, ok := userVal.(*auth.User)
	if !ok || user.UserID == 0 {
		c.AbortWithStatusJSON(403, gin.H{"error": "Interactive user required"})
		return
	}
	task := c.Param("taskId")
	itemID := c.Param("id")
	if relation == "checklist" && op != "create" {
		if !validUUID(itemID) {
			c.AbortWithStatusJSON(400, gin.H{"error": "Exact checklist UUID required"})
			return
		}
		if e := h.db.QueryRow(`SELECT i.task_id::text FROM planner_checklist_items i JOIN planner_tasks t ON t.id=i.task_id WHERE i.id=$1 AND EXISTS(SELECT 1 FROM planner_members m WHERE m.plan_id=t.plan_id AND m.user_id=$2)`, itemID, fmt.Sprint(user.UserID)).Scan(&task); e != nil {
			fail(c, e)
			return
		}
	}
	if !validUUID(task) {
		c.AbortWithStatusJSON(400, gin.H{"error": "Exact task UUID required"})
		return
	}
	var raw []byte
	if e := h.db.QueryRow(`SELECT jsonb_build_object('plan_id',t.plan_id,'version',to_char(t.updated_at AT TIME ZONE 'UTC',`+versionSQL+`),'checklist',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'is_completed',i.is_completed,'position',i.position) ORDER BY i.position,i.id) FROM planner_checklist_items i WHERE i.task_id=t.id),'[]'::jsonb),'assignees',COALESCE((SELECT jsonb_agg(a.user_id ORDER BY a.user_id) FROM planner_task_assignees a WHERE a.task_id=t.id),'[]'::jsonb)) FROM planner_tasks t WHERE t.id=$1 AND t.archived_at IS NULL AND EXISTS(SELECT 1 FROM planner_members m WHERE m.plan_id=t.plan_id AND m.user_id=$2)`, task, fmt.Sprint(user.UserID)).Scan(&raw); e != nil {
		fail(c, e)
		return
	}
	var state struct {
		Plan      string      `json:"plan_id"`
		Version   string      `json:"version"`
		Checklist []Checklist `json:"checklist"`
		Assignees []string    `json:"assignees"`
	}
	if e := json.Unmarshal(raw, &state); e != nil {
		fail(c, e)
		return
	}
	in := Request{PlanID: state.Plan, TaskID: task, ExpectedUpdatedAt: state.Version, AllowDuplicate: true}
	var body struct {
		Title     *string `json:"title"`
		Completed *bool   `json:"isCompleted"`
		UserID    string  `json:"userId"`
	}
	if op != "delete" {
		d := json.NewDecoder(io.LimitReader(c.Request.Body, 16385))
		if d.Decode(&body) != nil || d.Decode(new(any)) != io.EOF || d.InputOffset() > 16384 {
			c.AbortWithStatusJSON(400, gin.H{"error": "One bounded native relation object required"})
			return
		}
	}
	if relation == "checklist" {
		items := state.Checklist
		if op == "create" {
			if body.Title == nil {
				c.AbortWithStatusJSON(400, gin.H{"error": "Title required"})
				return
			}
			itemID = uuid.NewString()
			items = append(items, Checklist{ID: itemID, Title: *body.Title, Position: len(items)})
		} else {
			found := false
			out := []Checklist{}
			for _, i := range items {
				if i.ID == itemID {
					found = true
					if op == "delete" {
						continue
					}
					if body.Title != nil {
						i.Title = *body.Title
					}
					if body.Completed != nil {
						i.IsCompleted = *body.Completed
					}
				}
				out = append(out, i)
			}
			if !found {
				c.AbortWithStatusJSON(404, gin.H{"error": "Checklist item unavailable"})
				return
			}
			items = out
		}
		in.Checklist = &items
	} else {
		ids := state.Assignees
		selected := body.UserID
		if op == "delete" {
			selected = c.Param("userId")
		}
		out := []string{}
		exists := false
		for _, id := range ids {
			if id == selected {
				exists = true
				if op == "delete" {
					continue
				}
			}
			out = append(out, id)
		}
		if op == "create" && !exists {
			out = append(out, selected)
		}
		if len(out) == len(ids) && (op == "create" && exists || op == "delete" && !exists) {
			c.JSON(200, gin.H{"status": "unchanged"})
			return
		}
		in.AssigneeIDs = &out
	}
	h.apply(c, "tasks", "update", in, true)
	if c.IsAborted() {
		return
	}
	if relation == "checklist" && op == "create" {
		c.JSON(201, gin.H{"id": itemID, "taskId": task, "title": body.Title, "isCompleted": false, "position": len(state.Checklist)})
		return
	}
	c.JSON(200, gin.H{"status": "updated"})
}

func (h *Handler) NativeFavorite(c *gin.Context) {
	userVal, _ := c.Get("user")
	user, ok := userVal.(*auth.User)
	if !ok || user.UserID == 0 {
		c.AbortWithStatusJSON(403, gin.H{"error": "Interactive user required"})
		return
	}
	id := c.Param("planId")
	if !validUUID(id) {
		c.AbortWithStatusJSON(400, gin.H{"error": "Exact plan UUID required"})
		return
	}
	var version string
	var favorite bool
	if e := h.db.QueryRow(`SELECT to_char(p.updated_at AT TIME ZONE 'UTC',`+versionSQL+`),NOT p.is_favorite FROM planner_plans p WHERE p.id=$1 AND EXISTS(SELECT 1 FROM planner_members m WHERE m.plan_id=p.id AND m.user_id=$2)`, id, fmt.Sprint(user.UserID)).Scan(&version, &favorite); e != nil {
		fail(c, e)
		return
	}
	h.apply(c, "plans", "update", Request{PlanID: id, IsFavorite: &favorite, ExpectedUpdatedAt: version, AllowDuplicate: true}, true)
	if !c.IsAborted() {
		c.JSON(200, gin.H{"status": "updated"})
	}
}
