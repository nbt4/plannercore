package tasks

import (
	"time"

	"plannercore/internal/core"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Service struct {
	repo     *Repository
	eventBus *core.EventBus
}

func NewService(repo *Repository, eventBus *core.EventBus) *Service {
	return &Service{repo: repo, eventBus: eventBus}
}

// annotate populates a task's computed Status/IsLate fields before it's
// returned to a caller. Every service method that returns Task(s) must
// route through this (or annotateAll) — the fields are gorm:"-" so they're
// otherwise left zero-valued straight out of the repository.
func annotate(task *core.Task) *core.Task {
	if task == nil {
		return task
	}
	task.Status = task.ComputedStatus()
	task.IsLate = task.ComputeIsLate()
	return task
}

func annotateAll(tasks []core.Task) []core.Task {
	for i := range tasks {
		tasks[i].Status = tasks[i].ComputedStatus()
		tasks[i].IsLate = tasks[i].ComputeIsLate()
	}
	return tasks
}

func (s *Service) ListTasks(planID, bucketID, labelID, assigneeID string) ([]core.Task, error) {
	tasks, err := s.repo.FindByPlanID(planID, bucketID, labelID, assigneeID)
	if err != nil {
		return nil, err
	}
	return annotateAll(tasks), nil
}

func (s *Service) GetTask(id string) (*core.Task, error) {
	task, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	return annotate(task), nil
}

func (s *Service) CreateTask(planID string, bucketID *string, title string, userID string) (*core.Task, error) {
	task := &core.Task{
		ID:        uuid.New().String(),
		PlanID:    planID,
		BucketID:  bucketID,
		Title:     title,
		CreatedBy: userID,
	}
	if err := s.repo.Create(task); err != nil {
		return nil, err
	}
	annotate(task)
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventTaskCreated,
		PlanID:  planID,
		Payload: task,
		UserID:  userID,
	})
	return task, nil
}

var validRecurrences = map[string]bool{"none": true, "daily": true, "weekly": true, "monthly": true}

func (s *Service) UpdateTask(id string, updates map[string]interface{}, userID string) (*core.Task, error) {
	task, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	wasCompleted := task.CompletedAt != nil
	if v, ok := updates["title"].(string); ok {
		task.Title = v
	}
	if v, ok := updates["priority"].(string); ok {
		task.Priority = v
	}
	if v, ok := updates["recurrence"].(string); ok && validRecurrences[v] {
		task.Recurrence = v
	}
	if v, ok := updates["richTextNotes"].(string); ok {
		task.RichTextNotes = v
	}
	if v, ok := updates["bucketId"].(string); ok {
		task.BucketID = &v
	}
	if v, ok := updates["dueDate"].(string); ok {
		t, _ := time.Parse(time.RFC3339, v)
		task.DueDate = &t
	}
	if v, ok := updates["startDate"].(string); ok {
		t, _ := time.Parse(time.RFC3339, v)
		task.StartDate = &t
	}
	// status is a write-only convenience over CompletedAt/StartDate — see
	// Task.ComputedStatus. "completed" stamps CompletedAt; the other two
	// states just make sure CompletedAt is cleared, and "in-progress" also
	// backfills StartDate so ComputedStatus reports it correctly afterwards.
	if v, ok := updates["status"].(string); ok {
		switch v {
		case "completed":
			now := time.Now()
			task.CompletedAt = &now
		case "in-progress":
			task.CompletedAt = nil
			if task.StartDate == nil {
				now := time.Now()
				task.StartDate = &now
			}
		case "not-started":
			task.CompletedAt = nil
			task.StartDate = nil
		}
	}
	if err := s.repo.Update(task); err != nil {
		return nil, err
	}
	annotate(task)
	s.eventBus.Publish(task.PlanID, core.PlanEvent{
		Type:    core.EventTaskUpdated,
		PlanID:  task.PlanID,
		Payload: task,
		UserID:  userID,
	})
	if !wasCompleted && task.CompletedAt != nil && task.Recurrence != "none" {
		// Errors here intentionally don't fail the update the user asked
		// for — completing the task is the primary action, spinning off
		// the next occurrence is a side effect of it.
		s.spinOffRecurrence(task, userID)
	}
	return task, nil
}

// spinOffRecurrence creates the next occurrence of a just-completed
// recurring task: same plan/bucket/title/priority/recurrence/assignees, a
// due date advanced by one recurrence interval from the completed task's
// due date (or from now, if it had none), and a clean slate otherwise
// (no checklist items, comments, attachments, or labels carried over).
func (s *Service) spinOffRecurrence(completed *core.Task, userID string) {
	next := &core.Task{
		ID:         uuid.New().String(),
		PlanID:     completed.PlanID,
		BucketID:   completed.BucketID,
		Title:      completed.Title,
		Priority:   completed.Priority,
		Recurrence: completed.Recurrence,
		DueDate:    nextDueDate(completed.DueDate, completed.Recurrence),
		CreatedBy:  completed.CreatedBy,
	}
	if err := s.repo.Create(next); err != nil {
		return
	}
	s.repo.CopyAssignees(completed.ID, next.ID)
	annotate(next)
	s.eventBus.Publish(next.PlanID, core.PlanEvent{
		Type:    core.EventTaskCreated,
		PlanID:  next.PlanID,
		Payload: next,
		UserID:  userID,
	})
}

func nextDueDate(current *time.Time, recurrence string) *time.Time {
	base := time.Now()
	if current != nil {
		base = *current
	}
	var next time.Time
	switch recurrence {
	case "daily":
		next = base.AddDate(0, 0, 1)
	case "weekly":
		next = base.AddDate(0, 0, 7)
	case "monthly":
		next = base.AddDate(0, 1, 0)
	default:
		return nil
	}
	return &next
}

// recomputeProgress derives a task's progress percentage from its checklist
// items and persists it. Progress has no manual setter — it always reflects
// checklist completion (0 when there are no checklist items yet).
func (s *Service) recomputeProgress(taskID string) error {
	total, completed, err := s.repo.ChecklistCounts(taskID)
	if err != nil {
		return err
	}
	task, err := s.repo.FindByID(taskID)
	if err != nil {
		return err
	}
	task.ChecklistTotalCount = total
	task.ChecklistCompletedCount = completed
	if total > 0 {
		task.Progress = int(float64(completed) / float64(total) * 100)
	} else {
		task.Progress = 0
	}
	if err := s.repo.Update(task); err != nil {
		return err
	}
	annotate(task)
	s.eventBus.Publish(task.PlanID, core.PlanEvent{
		Type:    core.EventTaskUpdated,
		PlanID:  task.PlanID,
		Payload: task,
	})
	return nil
}

func (s *Service) DeleteTask(id, userID string) error {
	task, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	s.eventBus.Publish(task.PlanID, core.PlanEvent{
		Type:    core.EventTaskDeleted,
		PlanID:  task.PlanID,
		Payload: gin.H{"taskId": id},
		UserID:  userID,
	})
	return nil
}

func (s *Service) GetMyTasks(userID string) ([]core.Task, error) {
	tasks, err := s.repo.FindByAssignee(userID)
	if err != nil {
		return nil, err
	}
	return annotateAll(tasks), nil
}

func (s *Service) GetMyDay(userID string) ([]core.Task, error) {
	tasks, err := s.repo.FindMyDay(userID)
	if err != nil {
		return nil, err
	}
	return annotateAll(tasks), nil
}

func (s *Service) AddToMyDay(userID, taskID string) error {
	return s.repo.AddToMyDay(userID, taskID)
}

func (s *Service) RemoveFromMyDay(userID, taskID string) error {
	return s.repo.RemoveFromMyDay(userID, taskID)
}
