package tasks

import (
	"fmt"
	"net/http"

	"plannercore/internal/auth"
	"plannercore/internal/core"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	service    *Service
	repo       *Repository
	sessionVal *auth.SessionValidator
}

func NewHandler(service *Service, repo *Repository, sv *auth.SessionValidator) *Handler {
	return &Handler{service: service, repo: repo, sessionVal: sv}
}

// FIXED: RegisterRoutes now takes two groups — planRoutes (with plan membership)
// for plan-scoped task routes, and api (auth only) for task-specific routes
// that internally verify plan membership.
func (h *Handler) RegisterRoutes(api *gin.RouterGroup, planRoutes *gin.RouterGroup) {
	// Plan-scoped task routes (plan membership checked by middleware)
	planRoutes.GET("/:planId/tasks", h.ListTasks)
	planRoutes.POST("/:planId/tasks", h.CreateTask)
	planRoutes.PUT("/:planId/tasks/reorder", h.ReorderTasks)

	// Task-scoped routes — verify plan membership internally, resolved from
	// the task's plan_id via requirePlanMembershipVia.
	requireTask := h.requirePlanMembershipVia("task not found", h.planIDForTask)
	tasks := api.Group("/tasks")
	tasks.GET("/:taskId", requireTask, h.GetTask)
	tasks.PUT("/:taskId", requireTask, h.UpdateTask)
	tasks.DELETE("/:taskId", requireTask, h.DeleteTask)
	tasks.POST("/:taskId/checklist", requireTask, h.AddChecklistItem)
	tasks.POST("/:taskId/assignees", requireTask, h.AddAssignee)
	tasks.DELETE("/:taskId/assignees/:userId", requireTask, h.RemoveAssignee)
	tasks.GET("/:taskId/comments", requireTask, h.ListComments)
	tasks.POST("/:taskId/comments", requireTask, h.AddComment)
	tasks.POST("/:taskId/attachments", requireTask, h.AddAttachment)

	// Checklist-scoped routes: plan membership resolved via checklist item -> task -> plan.
	requireChecklistItem := h.requirePlanMembershipVia("checklist item not found", h.planIDForChecklistItem)
	api.PATCH("/checklist/:id", requireChecklistItem, h.UpdateChecklistItem)
	api.DELETE("/checklist/:id", requireChecklistItem, h.DeleteChecklistItem)

	// Attachment-scoped routes: plan membership resolved via attachment -> task -> plan.
	api.DELETE("/attachments/:id", h.requirePlanMembershipVia("attachment not found", h.planIDForAttachment), h.DeleteAttachment)

	// My Tasks / My Day routes. AddToMyDay pulls an arbitrary task into the
	// caller's own "my day" list, so it's gated the same way — otherwise a
	// non-member could add any task ID to their list and read its full
	// contents back via GetMyDay.
	api.GET("/my/tasks", h.GetMyTasks)
	api.GET("/my/day", h.GetMyDay)
	api.POST("/my/day/:taskId", requireTask, h.AddToMyDay)
	api.DELETE("/my/day/:taskId", h.RemoveFromMyDay)
}

// requirePlanMembershipVia builds middleware that resolves a plan ID from
// the request via resolve, then verifies the authenticated user is a member
// of that plan. Used for routes keyed by an entity other than planId itself
// (a task, checklist item, or attachment) where the group-level
// RequirePlanMember middleware doesn't apply.
func (h *Handler) requirePlanMembershipVia(notFoundMsg string, resolve func(c *gin.Context) (string, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := h.sessionVal.GetCurrentUser(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}
		planID, err := resolve(c)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": notFoundMsg})
			c.Abort()
			return
		}
		var count int64
		h.repo.db.Table("planner_members").Where("plan_id = ? AND user_id = ?", planID, fmt.Sprintf("%d", user.UserID)).Count(&count)
		if count == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied — not a plan member"})
			c.Abort()
			return
		}
		c.Set("taskPlanID", planID)
		c.Next()
	}
}

func (h *Handler) planIDForTask(c *gin.Context) (string, error) {
	var task core.Task
	if err := h.repo.db.Select("plan_id").First(&task, "id = ?", c.Param("taskId")).Error; err != nil {
		return "", err
	}
	return task.PlanID, nil
}

func (h *Handler) planIDForChecklistItem(c *gin.Context) (string, error) {
	var item core.ChecklistItem
	if err := h.repo.db.Select("task_id").First(&item, "id = ?", c.Param("id")).Error; err != nil {
		return "", err
	}
	var task core.Task
	if err := h.repo.db.Select("plan_id").First(&task, "id = ?", item.TaskID).Error; err != nil {
		return "", err
	}
	return task.PlanID, nil
}

func (h *Handler) planIDForAttachment(c *gin.Context) (string, error) {
	var attachment core.Attachment
	if err := h.repo.db.Select("task_id").First(&attachment, "id = ?", c.Param("id")).Error; err != nil {
		return "", err
	}
	var task core.Task
	if err := h.repo.db.Select("plan_id").First(&task, "id = ?", attachment.TaskID).Error; err != nil {
		return "", err
	}
	return task.PlanID, nil
}

func (h *Handler) ListTasks(c *gin.Context) {
	planID := c.Param("planId")
	bucketID := c.Query("bucketId")
	labelID := c.Query("labelId")
	assigneeID := c.Query("assigneeId")
	tasks, err := h.service.ListTasks(planID, bucketID, labelID, assigneeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

func (h *Handler) GetTask(c *gin.Context) {
	task, err := h.service.GetTask(c.Param("taskId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	c.JSON(http.StatusOK, task)
}

func (h *Handler) CreateTask(c *gin.Context) {
	var input struct {
		Title    string  `json:"title" binding:"required"`
		BucketID *string `json:"bucketId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.sessionVal.GetCurrentUser(c)
	task, err := h.service.CreateTask(c.Param("planId"), input.BucketID, input.Title, fmt.Sprintf("%d", user.UserID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, task)
}

func (h *Handler) UpdateTask(c *gin.Context) {
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.sessionVal.GetCurrentUser(c)
	task, err := h.service.UpdateTask(c.Param("taskId"), updates, fmt.Sprintf("%d", user.UserID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, task)
}

func (h *Handler) DeleteTask(c *gin.Context) {
	user, _ := h.sessionVal.GetCurrentUser(c)
	if err := h.service.DeleteTask(c.Param("taskId"), fmt.Sprintf("%d", user.UserID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// FIXED: ReorderTasks now validates plan membership, uses a DB transaction,
// and validates that all task IDs belong to the plan.
func (h *Handler) ReorderTasks(c *gin.Context) {
	planID := c.Param("planId")

	// Accept both flat array and {items: [...]} format for frontend compatibility
	var rawInput interface{}
	if err := c.ShouldBindJSON(&rawInput); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	type reorderItem struct {
		ID       string  `json:"id"`
		BucketID string  `json:"bucketId"`
		Position float64 `json:"position"`
	}

	var items []reorderItem
	switch v := rawInput.(type) {
	case []interface{}:
		for _, item := range v {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			ri := reorderItem{}
			if id, ok := m["id"].(string); ok {
				ri.ID = id
			}
			if bid, ok := m["bucketId"].(string); ok {
				ri.BucketID = bid
			}
			if pos, ok := m["position"].(float64); ok {
				ri.Position = pos
			}
			items = append(items, ri)
		}
	case map[string]interface{}:
		if arr, ok := v["items"].([]interface{}); ok {
			for _, item := range arr {
				m, ok := item.(map[string]interface{})
				if !ok {
					continue
				}
				ri := reorderItem{}
				if id, ok := m["id"].(string); ok {
					ri.ID = id
				}
				if bid, ok := m["bucketId"].(string); ok {
					ri.BucketID = bid
				}
				if pos, ok := m["position"].(float64); ok {
					ri.Position = pos
				}
				items = append(items, ri)
			}
		}
	}

	if len(items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no items to reorder"})
		return
	}

	// FIXED: Validate all task IDs belong to the plan within a transaction
	err := h.repo.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			var taskPlanID string
			if err := tx.Model(&core.Task{}).Select("plan_id").Where("id = ?", item.ID).Scan(&taskPlanID).Error; err != nil {
				return fmt.Errorf("task %s not found: %v", item.ID, err)
			}
			if taskPlanID != planID {
				return fmt.Errorf("task %s does not belong to plan %s", item.ID, planID)
			}
		}
		// All validated; now update positions
		for _, item := range items {
			if err := tx.Model(&core.Task{}).Where("id = ?", item.ID).Updates(map[string]interface{}{
				"bucket_id": item.BucketID,
				"position":  item.Position,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// One event per reordered task, mirroring how CreateTask/UpdateTask
	// already publish the full annotated task. A single drag can touch
	// every task in the plan (positions are renumbered per-bucket on every
	// move — see BoardView.handleDragEnd), so this is one query per moved
	// task; that's an existing cost of this endpoint's semantics, not a
	// regression this change introduces.
	for _, item := range items {
		task, err := h.service.GetTask(item.ID)
		if err != nil {
			continue
		}
		h.service.eventBus.Publish(planID, core.PlanEvent{
			Type:    core.EventTaskUpdated,
			PlanID:  planID,
			Payload: task,
		})
	}
	c.JSON(http.StatusOK, gin.H{"status": "reordered"})
}

func (h *Handler) AddChecklistItem(c *gin.Context) {
	var input struct {
		Title string `json:"title" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	taskID := c.Param("taskId")
	item := core.ChecklistItem{
		TaskID: taskID,
		Title:  input.Title,
	}
	if err := h.repo.db.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.recomputeProgress(taskID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *Handler) UpdateChecklistItem(c *gin.Context) {
	var input struct {
		Title       *string `json:"title"`
		IsCompleted *bool   `json:"isCompleted"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if input.Title != nil {
		updates["title"] = *input.Title
	}
	if input.IsCompleted != nil {
		updates["is_completed"] = *input.IsCompleted
	}
	var item core.ChecklistItem
	if err := h.repo.db.Select("task_id").First(&item, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "checklist item not found"})
		return
	}
	if err := h.repo.db.Model(&core.ChecklistItem{}).Where("id = ?", c.Param("id")).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if input.IsCompleted != nil {
		if err := h.service.recomputeProgress(item.TaskID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteChecklistItem(c *gin.Context) {
	var item core.ChecklistItem
	if err := h.repo.db.Select("task_id").First(&item, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "checklist item not found"})
		return
	}
	if err := h.repo.db.Delete(&core.ChecklistItem{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.recomputeProgress(item.TaskID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) AddAssignee(c *gin.Context) {
	var input struct {
		UserID string `json:"userId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	assignee := core.TaskAssignee{
		TaskID: c.Param("taskId"),
		UserID: input.UserID,
	}
	if err := h.repo.db.Create(&assignee).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.publishTaskUpdated(c.Param("taskId"))
	c.JSON(http.StatusCreated, assignee)
}

func (h *Handler) RemoveAssignee(c *gin.Context) {
	if err := h.repo.db.Delete(&core.TaskAssignee{}, "task_id = ? AND user_id = ?",
		c.Param("taskId"), c.Param("userId")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.publishTaskUpdated(c.Param("taskId"))
	c.JSON(http.StatusOK, gin.H{"status": "removed"})
}

// publishTaskUpdated re-fetches the full annotated task and publishes it as
// a task.updated event, mirroring how CreateTask/UpdateTask/ReorderTasks
// already notify other tabs of a change. A failed re-fetch is not surfaced
// to the caller: the assignee mutation itself already succeeded and
// returned 2xx, so it doesn't need to be aborted over a live-sync miss.
func (h *Handler) publishTaskUpdated(taskID string) {
	task, err := h.service.GetTask(taskID)
	if err != nil {
		return
	}
	h.service.eventBus.Publish(task.PlanID, core.PlanEvent{
		Type:    core.EventTaskUpdated,
		PlanID:  task.PlanID,
		Payload: task,
	})
}

func (h *Handler) ListComments(c *gin.Context) {
	var comments []core.Comment
	if err := h.repo.db.Where("task_id = ?", c.Param("taskId")).
		Order("created_at ASC").Find(&comments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, comments)
}

func (h *Handler) AddComment(c *gin.Context) {
	var input struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.sessionVal.GetCurrentUser(c)
	comment := core.Comment{
		TaskID:  c.Param("taskId"),
		UserID:  fmt.Sprintf("%d", user.UserID),
		Content: input.Content,
	}
	if err := h.repo.db.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, comment)
}

func (h *Handler) AddAttachment(c *gin.Context) {
	var input struct {
		Filename string `json:"filename" binding:"required"`
		FilePath string `json:"filePath" binding:"required"`
		FileSize int64  `json:"fileSize"`
		MimeType string `json:"mimeType"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.sessionVal.GetCurrentUser(c)
	attachment := core.Attachment{
		TaskID:     c.Param("taskId"),
		Filename:   input.Filename,
		FilePath:   input.FilePath,
		FileSize:   input.FileSize,
		MimeType:   input.MimeType,
		UploadedBy: fmt.Sprintf("%d", user.UserID),
	}
	if err := h.repo.db.Create(&attachment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, attachment)
}

func (h *Handler) DeleteAttachment(c *gin.Context) {
	if err := h.repo.db.Delete(&core.Attachment{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) GetMyTasks(c *gin.Context) {
	user, _ := h.sessionVal.GetCurrentUser(c)
	tasks, err := h.service.GetMyTasks(fmt.Sprintf("%d", user.UserID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

func (h *Handler) GetMyDay(c *gin.Context) {
	user, _ := h.sessionVal.GetCurrentUser(c)
	tasks, err := h.service.GetMyDay(fmt.Sprintf("%d", user.UserID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

func (h *Handler) AddToMyDay(c *gin.Context) {
	user, _ := h.sessionVal.GetCurrentUser(c)
	if err := h.service.AddToMyDay(fmt.Sprintf("%d", user.UserID), c.Param("taskId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "added"})
}

func (h *Handler) RemoveFromMyDay(c *gin.Context) {
	user, _ := h.sessionVal.GetCurrentUser(c)
	if err := h.service.RemoveFromMyDay(fmt.Sprintf("%d", user.UserID), c.Param("taskId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "removed"})
}
