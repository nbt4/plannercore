package analytics

import (
	"net/http"
	"time"

	"plannercore/internal/auth"
	"plannercore/internal/core"

	"github.com/gin-gonic/gin"
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
	rg.GET("/:planId/analytics/tasks", h.TaskChart)
	rg.GET("/:planId/analytics/workload", h.WorkloadChart)
	rg.GET("/:planId/analytics/burndown", h.BurndownChart)
}

type TaskChartResult struct {
	BucketName string `json:"bucketName"`
	TotalCount int64  `json:"totalCount"`
	Completed  int64  `json:"completed"`
	InProgress int64  `json:"inProgress"`
	Overdue    int64  `json:"overdue"`
}

func (h *Handler) TaskChart(c *gin.Context) {
	planID := c.Param("planId")

	var buckets []core.Bucket
	if err := h.db.Where("plan_id = ?", planID).Find(&buckets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var results []TaskChartResult
	now := time.Now()
	for _, b := range buckets {
		var total, completed, inProgress, overdue int64
		h.db.Model(&core.Task{}).Where("bucket_id = ?", b.ID).Count(&total)
		h.db.Model(&core.Task{}).Where("bucket_id = ? AND completed_at IS NOT NULL", b.ID).Count(&completed)
		h.db.Model(&core.Task{}).Where("bucket_id = ? AND completed_at IS NULL AND progress > 0", b.ID).Count(&inProgress)
		h.db.Model(&core.Task{}).Where("bucket_id = ? AND completed_at IS NULL AND due_date < ?", b.ID, now).Count(&overdue)

		results = append(results, TaskChartResult{
			BucketName: b.Name,
			TotalCount: total,
			Completed:  completed,
			InProgress: inProgress,
			Overdue:    overdue,
		})
	}

	c.JSON(http.StatusOK, results)
}

type WorkloadChartResult struct {
	UserID         string `json:"userId"`
	Username       string `json:"username"`
	TotalTasks     int64  `json:"totalTasks"`
	CompletedTasks int64  `json:"completedTasks"`
	OverdueTasks   int64  `json:"overdueTasks"`
}

func (h *Handler) WorkloadChart(c *gin.Context) {
	planID := c.Param("planId")

	var assignees []struct {
		UserID string
	}
	h.db.Table("planner_task_assignees").
		Select("DISTINCT user_id").
		Where("task_id IN (SELECT id FROM planner_tasks WHERE plan_id = ?)", planID).
		Scan(&assignees)

	var results []WorkloadChartResult
	now := time.Now()
	for _, a := range assignees {
		var total, completed, overdue int64
		h.db.Model(&core.Task{}).
			Where("plan_id = ? AND id IN (SELECT task_id FROM planner_task_assignees WHERE user_id = ?)", planID, a.UserID).
			Count(&total)
		h.db.Model(&core.Task{}).
			Where("plan_id = ? AND id IN (SELECT task_id FROM planner_task_assignees WHERE user_id = ?) AND completed_at IS NOT NULL", planID, a.UserID).
			Count(&completed)
		h.db.Model(&core.Task{}).
			Where("plan_id = ? AND id IN (SELECT task_id FROM planner_task_assignees WHERE user_id = ?) AND completed_at IS NULL AND due_date < ?", planID, a.UserID, now).
			Count(&overdue)

		// FIXED: use userid column instead of id
		var username string
		h.db.Table("users u").
			Select("COALESCE(NULLIF(p.display_name, ''), NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username)").
			Joins("LEFT JOIN user_profiles p ON p.user_id = u.userid").
			Where("u.userid = ?", a.UserID).Scan(&username)

		results = append(results, WorkloadChartResult{
			UserID:         a.UserID,
			Username:       username,
			TotalTasks:     total,
			CompletedTasks: completed,
			OverdueTasks:   overdue,
		})
	}

	c.JSON(http.StatusOK, results)
}

type BurndownEntry struct {
	Date           string `json:"date"`
	TotalRemaining int64  `json:"totalRemaining"`
}

func (h *Handler) BurndownChart(c *gin.Context) {
	planID := c.Param("planId")

	// Find the active sprint
	var sprint core.Sprint
	if err := h.db.Where("plan_id = ? AND is_active = ?", planID, true).First(&sprint).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active sprint found"})
		return
	}

	if sprint.StartDate == nil || sprint.EndDate == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sprint must have start and end dates"})
		return
	}

	start := *sprint.StartDate
	end := *sprint.EndDate

	// Get total task count at sprint start (all tasks in sprint)
	var totalTasks int64
	h.db.Model(&core.SprintTask{}).Where("sprint_id = ?", sprint.ID).Count(&totalTasks)

	// Generate daily entries
	var entries []BurndownEntry
	current := start
	for !current.After(end) {
		var completedBefore int64
		h.db.Model(&core.Task{}).
			Where("id IN (SELECT task_id FROM planner_sprint_tasks WHERE sprint_id = ?) AND completed_at IS NOT NULL AND completed_at <= ?", sprint.ID, current).
			Count(&completedBefore)

		remaining := totalTasks - completedBefore
		entries = append(entries, BurndownEntry{
			Date:           current.Format("2006-01-02"),
			TotalRemaining: remaining,
		})
		current = current.AddDate(0, 0, 1)
	}

	c.JSON(http.StatusOK, gin.H{
		"sprint":  sprint,
		"entries": entries,
	})
}
