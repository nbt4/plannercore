package boards

import (
	"net/http"

	"plannercore/internal/auth"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service    *Service
	sessionVal *auth.SessionValidator
}

func NewHandler(service *Service, sv *auth.SessionValidator) *Handler {
	return &Handler{service: service, sessionVal: sv}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/:planId/buckets", h.ListBuckets)
	rg.POST("/:planId/buckets", h.CreateBucket)
	rg.PUT("/:planId/buckets/:id", h.UpdateBucket)
	rg.DELETE("/:planId/buckets/:id", h.DeleteBucket)
}

func (h *Handler) ListBuckets(c *gin.Context) {
	buckets, err := h.service.GetBuckets(c.Param("planId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, buckets)
}

func (h *Handler) CreateBucket(c *gin.Context) {
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	bucket, err := h.service.CreateBucket(c.Param("planId"), input.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, bucket)
}

func (h *Handler) UpdateBucket(c *gin.Context) {
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.UpdateBucket(c.Param("id"), input.Name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteBucket(c *gin.Context) {
	if err := h.service.DeleteBucket(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
