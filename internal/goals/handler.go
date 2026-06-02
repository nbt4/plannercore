package goals

import (
	"net/http"

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
	rg.GET("/:planId/goals", h.ListGoals)
	rg.POST("/:planId/goals", h.CreateGoal)
	rg.PUT("/:planId/goals/:id", h.UpdateGoal)
	rg.DELETE("/:planId/goals/:id", h.DeleteGoal)
}

func (h *Handler) ListGoals(c *gin.Context) {
	var goals []core.Goal
	if err := h.db.Where("plan_id = ?", c.Param("planId")).Order("created_at ASC").Find(&goals).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Build hierarchy: group goals by parentGoalId
	goalMap := make(map[string][]core.Goal)
	var topLevel []core.Goal
	for _, g := range goals {
		if g.ParentGoalID == nil || *g.ParentGoalID == "" {
			topLevel = append(topLevel, g)
		} else {
			goalMap[*g.ParentGoalID] = append(goalMap[*g.ParentGoalID], g)
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"goals":     topLevel,
		"children":  goalMap,
	})
}

func (h *Handler) CreateGoal(c *gin.Context) {
	var input struct {
		Title        string  `json:"title" binding:"required"`
		Description  string  `json:"description"`
		ParentGoalID *string `json:"parentGoalId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	goal := core.Goal{
		ID:           uuid.New().String(),
		PlanID:       c.Param("planId"),
		Title:        input.Title,
		Description:  input.Description,
		ParentGoalID: input.ParentGoalID,
	}
	if err := h.db.Create(&goal).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, goal)
}

func (h *Handler) UpdateGoal(c *gin.Context) {
	var input struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Progress    *int   `json:"progress"`
		Status      string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if input.Title != "" {
		updates["title"] = input.Title
	}
	if input.Description != "" {
		updates["description"] = input.Description
	}
	if input.Progress != nil {
		updates["progress"] = *input.Progress
	}
	if input.Status != "" {
		updates["status"] = input.Status
	}
	if err := h.db.Model(&core.Goal{}).Where("id = ? AND plan_id = ?", c.Param("id"), c.Param("planId")).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteGoal(c *gin.Context) {
	if err := h.db.Delete(&core.Goal{}, "id = ? AND plan_id = ?", c.Param("id"), c.Param("planId")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
