package timeline

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
	rg.GET("/:planId/timeline", h.GetTimeline)
	rg.POST("/:planId/dependencies", h.AddDependency)
	rg.DELETE("/:planId/dependencies/:id", h.DeleteDependency)
}

func (h *Handler) GetTimeline(c *gin.Context) {
	planID := c.Param("planId")

	var tasks []core.Task
	if err := h.db.Where("plan_id = ? AND (start_date IS NOT NULL OR due_date IS NOT NULL)", planID).
		Preload("Assignees").Preload("Labels").
		Order("COALESCE(start_date, due_date) ASC").Find(&tasks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var dependencies []core.Dependency
	if err := h.db.Where("predecessor_id IN (SELECT id FROM planner_tasks WHERE plan_id = ?) OR successor_id IN (SELECT id FROM planner_tasks WHERE plan_id = ?)", planID, planID).
		Find(&dependencies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks":        tasks,
		"dependencies": dependencies,
	})
}

func (h *Handler) AddDependency(c *gin.Context) {
	var input struct {
		PredecessorID  string `json:"predecessorId" binding:"required"`
		SuccessorID    string `json:"successorId" binding:"required"`
		DependencyType string `json:"dependencyType"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.DependencyType == "" {
		input.DependencyType = "finish-to-start"
	}
	dep := core.Dependency{
		ID:             uuid.New().String(),
		PredecessorID:  input.PredecessorID,
		SuccessorID:    input.SuccessorID,
		DependencyType: input.DependencyType,
	}
	if err := h.db.Create(&dep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, dep)
}

func (h *Handler) DeleteDependency(c *gin.Context) {
	if err := h.db.Delete(&core.Dependency{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
