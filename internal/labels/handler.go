package labels

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
	rg.GET("/:planId/labels", h.ListLabels)
	rg.POST("/:planId/labels", h.CreateLabel)
	rg.DELETE("/:planId/labels/:id", h.DeleteLabel)
}

func (h *Handler) ListLabels(c *gin.Context) {
	var labels []core.Label
	if err := h.db.Where("plan_id = ?", c.Param("planId")).Find(&labels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, labels)
}

func (h *Handler) CreateLabel(c *gin.Context) {
	var input struct {
		Name  string `json:"name" binding:"required"`
		Color string `json:"color" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	label := core.Label{
		ID:     uuid.New().String(),
		PlanID: c.Param("planId"),
		Name:   input.Name,
		Color:  input.Color,
	}
	if err := h.db.Create(&label).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, label)
}

func (h *Handler) DeleteLabel(c *gin.Context) {
	if err := h.db.Delete(&core.Label{}, "id = ? AND plan_id = ?", c.Param("id"), c.Param("planId")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
