package plans

import (
	"errors"
	"fmt"
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
	plans := rg.Group("/plans")
	plans.GET("", h.ListPlans)
	plans.POST("", h.CreatePlan)

	// Single-plan routes were previously unprotected here — the group-level
	// RequirePlanMember used elsewhere in main.go never applied to this
	// handler's own /plans/:planId routes, so any authenticated user could
	// read/rename/delete/copy/favorite any plan by ID. Scope them the same
	// way RequirePlanMember protects every other plan-scoped route.
	scoped := plans.Group("/:planId")
	scoped.Use(h.sessionVal.RequirePlanMember("planId"))
	scoped.GET("", h.GetPlan)
	scoped.PUT("", h.UpdatePlan)
	scoped.DELETE("", h.DeletePlan)
	scoped.POST("/copy", h.CopyPlan)
	scoped.POST("/favorite", h.ToggleFavorite)
	scoped.GET("/members", h.ListMembers)
	scoped.POST("/members", h.AddMember)
	scoped.DELETE("/members/:userId", h.RemoveMember)
}

func (h *Handler) ListMembers(c *gin.Context) {
	members, err := h.service.ListMembers(c.Param("planId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *Handler) AddMember(c *gin.Context) {
	var input struct {
		UserID string `json:"userId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "userId is required"})
		return
	}
	owner, _ := h.sessionVal.GetCurrentUser(c)
	err := h.service.AddMember(c.Param("planId"), fmt.Sprintf("%d", owner.UserID), input.UserID)
	if errors.Is(err, ErrNotOwner) {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	if errors.Is(err, ErrUserNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"status": "added"})
}

func (h *Handler) RemoveMember(c *gin.Context) {
	owner, _ := h.sessionVal.GetCurrentUser(c)
	err := h.service.RemoveMember(c.Param("planId"), fmt.Sprintf("%d", owner.UserID), c.Param("userId"))
	if errors.Is(err, ErrNotOwner) {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "removed"})
}

func (h *Handler) ListPlans(c *gin.Context) {
	user, _ := h.sessionVal.GetCurrentUser(c)
	plans, err := h.service.ListPlans(fmt.Sprintf("%d", user.UserID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, plans)
}

func (h *Handler) GetPlan(c *gin.Context) {
	plan, err := h.service.GetPlan(c.Param("planId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "plan not found"})
		return
	}
	c.JSON(http.StatusOK, plan)
}

func (h *Handler) CreatePlan(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.sessionVal.GetCurrentUser(c)
	plan, err := h.service.CreatePlan(input.Name, input.Description, fmt.Sprintf("%d", user.UserID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, plan)
}

func (h *Handler) UpdatePlan(c *gin.Context) {
	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.UpdatePlan(c.Param("planId"), input.Name, input.Description); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *Handler) DeletePlan(c *gin.Context) {
	if err := h.service.DeletePlan(c.Param("planId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) ToggleFavorite(c *gin.Context) {
	if err := h.service.ToggleFavorite(c.Param("planId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "toggled"})
}

func (h *Handler) CopyPlan(c *gin.Context) {
	user, _ := h.sessionVal.GetCurrentUser(c)
	plan, err := h.service.CopyPlan(c.Param("planId"), fmt.Sprintf("%d", user.UserID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, plan)
}
