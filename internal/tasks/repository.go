package tasks

import (
	"plannercore/internal/core"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindByPlanID(planID string, bucketID, labelID, assigneeID string) ([]core.Task, error) {
	var tasks []core.Task
	q := r.db.Where("plan_id = ?", planID)
	if bucketID != "" {
		q = q.Where("bucket_id = ?", bucketID)
	}
	if assigneeID != "" {
		q = q.Where("id IN (SELECT task_id FROM planner_task_assignees WHERE user_id = ?)", assigneeID)
	}
	if labelID != "" {
		q = q.Where("id IN (SELECT task_id FROM planner_task_labels WHERE label_id = ?)", labelID)
	}
	err := q.Order("position ASC").Preload("Assignees").Preload("Labels").Preload("ChecklistItems").Find(&tasks).Error
	return tasks, err
}

func (r *Repository) FindByID(id string) (*core.Task, error) {
	var task core.Task
	err := r.db.Preload("Assignees").Preload("Labels").Preload("ChecklistItems").
		Preload("Comments").Preload("Attachments").First(&task, "id = ?", id).Error
	return &task, err
}

func (r *Repository) Create(task *core.Task) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var maxPos float64
		tx.Model(&core.Task{}).Where("bucket_id = ?", task.BucketID).Select("COALESCE(MAX(position), 0)").Scan(&maxPos)
		task.Position = maxPos + 1000.0
		return tx.Create(task).Error
	})
}

func (r *Repository) Update(task *core.Task) error {
	return r.db.Save(task).Error
}

func (r *Repository) Delete(id string) error {
	return r.db.Delete(&core.Task{}, "id = ?", id).Error
}

// ChecklistCounts returns the total and completed checklist item counts for
// a task, used to derive its progress percentage.
func (r *Repository) ChecklistCounts(taskID string) (total, completed int, err error) {
	var totalCount int64
	if err = r.db.Model(&core.ChecklistItem{}).Where("task_id = ?", taskID).Count(&totalCount).Error; err != nil {
		return 0, 0, err
	}
	var completedCount int64
	if err = r.db.Model(&core.ChecklistItem{}).Where("task_id = ? AND is_completed = ?", taskID, true).Count(&completedCount).Error; err != nil {
		return 0, 0, err
	}
	return int(totalCount), int(completedCount), nil
}

// CopyAssignees copies the assignee list from one task to another, used
// when spinning off the next occurrence of a recurring task.
func (r *Repository) CopyAssignees(fromTaskID, toTaskID string) error {
	var assignees []core.TaskAssignee
	if err := r.db.Where("task_id = ?", fromTaskID).Find(&assignees).Error; err != nil {
		return err
	}
	for _, a := range assignees {
		if err := r.db.Create(&core.TaskAssignee{TaskID: toTaskID, UserID: a.UserID}).Error; err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) FindByAssignee(userID string, includeCompleted bool) ([]core.Task, error) {
	var tasks []core.Task
	query := r.db.Where("id IN (SELECT task_id FROM planner_task_assignees WHERE user_id = ?)", userID)
	if !includeCompleted {
		query = query.Where("completed_at IS NULL")
	}
	err := query.Order("CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END ASC, due_date ASC").
		Preload("Assignees").Preload("Labels").Find(&tasks).Error
	return tasks, err
}

func (r *Repository) FindMyDay(userID string) ([]core.Task, error) {
	var tasks []core.Task
	err := r.db.Where("id IN (SELECT task_id FROM planner_my_day WHERE user_id = ?)", userID).
		Order("due_date ASC").Preload("Assignees").Preload("Labels").Find(&tasks).Error
	return tasks, err
}

func (r *Repository) AddToMyDay(userID, taskID string) error {
	return r.db.Create(&core.MyDay{UserID: userID, TaskID: taskID}).Error
}

func (r *Repository) RemoveFromMyDay(userID, taskID string) error {
	return r.db.Delete(&core.MyDay{}, "user_id = ? AND task_id = ?", userID, taskID).Error
}
