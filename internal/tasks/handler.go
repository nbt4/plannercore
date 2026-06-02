package tasks

import (
	"fmt"
	"net/http"

	"plannercore/internal/auth"
	"plannercore/internal/core"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service    *Service
	repo       *Repository
	sessionVal *auth.SessionValidator
}

func NewHandler(service *Service, repo *Repository, sv *auth.SessionValidator) *Handler {
	return &Handler{service: service, repo: repo, sessionVal: sv}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	// Plan-scoped task routes
	rg.GET("/:planId/tasks", h.ListTasks)
	rg.POST("/:planId/tasks", h.CreateTask)

	// Task-scoped routes (no planId)
	tasks := rg.Group("/tasks")
	tasks.GET("/:taskId", h.GetTask)
	tasks.PUT("/:taskId", h.UpdateTask)
	tasks.DELETE("/:taskId", h.DeleteTask)
	tasks.PATCH("/:taskId/progress", h.UpdateProgress)
	tasks.PATCH("/reorder", h.ReorderTasks)
	tasks.POST("/:taskId/checklist", h.AddChecklistItem)
	tasks.POST("/:taskId/assignees", h.AddAssignee)
	tasks.DELETE("/:taskId/assignees/:userId", h.RemoveAssignee)
	tasks.GET("/:taskId/comments", h.ListComments)
	tasks.POST("/:taskId/comments", h.AddComment)
	tasks.POST("/:taskId/attachments", h.AddAttachment)

	// Checklist-scoped routes
	rg.PATCH("/checklist/:id", h.UpdateChecklistItem)
	rg.DELETE("/checklist/:id", h.DeleteChecklistItem)

	// Attachment-scoped routes
	rg.DELETE("/attachments/:id", h.DeleteAttachment)

	// My Tasks / My Day routes
	rg.GET("/my/tasks", h.GetMyTasks)
	rg.GET("/my/day", h.GetMyDay)
	rg.POST("/my/day/:taskId", h.AddToMyDay)
	rg.DELETE("/my/day/:taskId", h.RemoveFromMyDay)
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

func (h *Handler) UpdateProgress(c *gin.Context) {
	var input struct {
		Progress int `json:"progress" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.sessionVal.GetCurrentUser(c)
	task, err := h.service.GetTask(c.Param("taskId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	task.Progress = input.Progress
	if err := h.repo.Update(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.service.eventBus.Publish(task.PlanID, core.PlanEvent{
		Type:    core.EventTaskUpdated,
		PlanID:  task.PlanID,
		Payload: task,
		UserID:  fmt.Sprintf("%d", user.UserID),
	})
	c.JSON(http.StatusOK, task)
}

func (h *Handler) ReorderTasks(c *gin.Context) {
	var input []struct {
		ID        string  `json:"id"`
		BucketID  string  `json:"bucketId"`
		Position  float64 `json:"position"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for _, item := range input {
		h.repo.db.Model(&core.Task{}).Where("id = ?", item.ID).Updates(map[string]interface{}{
			"bucket_id": item.BucketID,
			"position":  item.Position,
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
	item := core.ChecklistItem{
		TaskID: c.Param("taskId"),
		Title:  input.Title,
	}
	if err := h.repo.db.Create(&item).Error; err != nil {
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
	if err := h.repo.db.Model(&core.ChecklistItem{}).Where("id = ?", c.Param("id")).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteChecklistItem(c *gin.Context) {
	if err := h.repo.db.Delete(&core.ChecklistItem{}, "id = ?", c.Param("id")).Error; err != nil {
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
	c.JSON(http.StatusCreated, assignee)
}

func (h *Handler) RemoveAssignee(c *gin.Context) {
	if err := h.repo.db.Delete(&core.TaskAssignee{}, "task_id = ? AND user_id = ?",
		c.Param("taskId"), c.Param("userId")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "removed"})
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
