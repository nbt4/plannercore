package sprints

import (
	"net/http"
	"time"

	"plannercore/internal/auth"
	"plannercore/internal/core"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Handler struct {
	db         *gorm.DB
	sessionVal *auth.SessionValidator
}

func NewHandler(db *gorm.DB, sv *auth.SessionValidator) *Handler {
	return &Handler{db: db, sessionVal: sv}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/:planId/sprints", h.ListSprints)
	rg.POST("/:planId/sprints", h.CreateSprint)
	rg.PUT("/:planId/sprints/:id", h.UpdateSprint)
	rg.DELETE("/:planId/sprints/:id", h.DeleteSprint)
	rg.POST("/:planId/sprints/:id/tasks", h.AddSprintTasks)
}

func (h *Handler) ListSprints(c *gin.Context) {
	var sprints []core.Sprint
	if err := h.db.Where("plan_id = ?", c.Param("planId")).Order("created_at DESC").Find(&sprints).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, sprints)
}

func (h *Handler) CreateSprint(c *gin.Context) {
	var input struct {
		Name      string     `json:"name" binding:"required"`
		Goal      string     `json:"goal"`
		StartDate *time.Time `json:"startDate"`
		EndDate   *time.Time `json:"endDate"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sprint := core.Sprint{
		ID:        uuid.New().String(),
		PlanID:    c.Param("planId"),
		Name:      input.Name,
		Goal:      input.Goal,
		StartDate: input.StartDate,
		EndDate:   input.EndDate,
	}
	if err := h.db.Create(&sprint).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, sprint)
}

func (h *Handler) UpdateSprint(c *gin.Context) {
	var input struct {
		Name      string     `json:"name"`
		Goal      string     `json:"goal"`
		StartDate *time.Time `json:"startDate"`
		EndDate   *time.Time `json:"endDate"`
		IsActive  *bool      `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if input.Goal != "" {
		updates["goal"] = input.Goal
	}
	if input.StartDate != nil {
		updates["start_date"] = *input.StartDate
	}
	if input.EndDate != nil {
		updates["end_date"] = *input.EndDate
	}
	if input.IsActive != nil {
		updates["is_active"] = *input.IsActive
	}
	if err := h.db.Model(&core.Sprint{}).Where("id = ? AND plan_id = ?", c.Param("id"), c.Param("planId")).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteSprint(c *gin.Context) {
	if err := h.db.Delete(&core.Sprint{}, "id = ? AND plan_id = ?", c.Param("id"), c.Param("planId")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) AddSprintTasks(c *gin.Context) {
	var input struct {
		TaskIDs []string `json:"taskIds" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	planID := c.Param("planId")
	sprintID := c.Param("id")

	var sprintCount int64
	h.db.Model(&core.Sprint{}).Where("id = ? AND plan_id = ?", sprintID, planID).Count(&sprintCount)
	if sprintCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "sprint not found in this plan"})
		return
	}

	var validTaskCount int64
	h.db.Model(&core.Task{}).Where("id IN ? AND plan_id = ?", input.TaskIDs, planID).Count(&validTaskCount)
	if int(validTaskCount) != len(input.TaskIDs) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "one or more tasks do not belong to this plan"})
		return
	}

	for _, taskID := range input.TaskIDs {
		h.db.Create(&core.SprintTask{SprintID: sprintID, TaskID: taskID})
	}
	c.JSON(http.StatusOK, gin.H{"status": "tasks added"})
}
