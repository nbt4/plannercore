package integration

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
	rg.GET("/:planId/links", h.ListLinks)
	rg.POST("/:planId/links", h.CreateLink)
	rg.DELETE("/:planId/links/:id", h.DeleteLink)
}

func (h *Handler) ListLinks(c *gin.Context) {
	var links []core.PlanLink
	if err := h.db.Where("plan_id = ?", c.Param("planId")).Find(&links).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, links)
}

func (h *Handler) CreateLink(c *gin.Context) {
	var input struct {
		EntityType string `json:"entityType" binding:"required"`
		EntityID   string `json:"entityId" binding:"required"`
		EntityName string `json:"entityName"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	link := core.PlanLink{
		ID:         uuid.New().String(),
		PlanID:     c.Param("planId"),
		EntityType: input.EntityType,
		EntityID:   input.EntityID,
		EntityName: input.EntityName,
	}
	if err := h.db.Create(&link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, link)
}

func (h *Handler) DeleteLink(c *gin.Context) {
	if err := h.db.Delete(&core.PlanLink{}, "id = ? AND plan_id = ?", c.Param("id"), c.Param("planId")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
