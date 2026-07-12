package boards

import (
	"errors"
	"net/http"

	"plannercore/internal/auth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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
	rg.POST("/:planId/buckets/:id/move", h.MoveBucket)
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
	if err := h.service.UpdateBucket(c.Param("planId"), c.Param("id"), input.Name); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "bucket not found in this plan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeleteBucket(c *gin.Context) {
	if err := h.service.DeleteBucket(c.Param("planId"), c.Param("id")); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "bucket not found in this plan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) MoveBucket(c *gin.Context) {
	var input struct {
		Direction string `json:"direction" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.MoveBucket(c.Param("planId"), c.Param("id"), input.Direction); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "bucket not found in this plan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "moved"})
}
