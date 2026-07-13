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

func (s *Service) ListTasks(planID, bucketID, labelID, assigneeID string) ([]core.Task, error) {
	return s.repo.FindByPlanID(planID, bucketID, labelID, assigneeID)
}

func (s *Service) GetTask(id string) (*core.Task, error) {
	return s.repo.FindByID(id)
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
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventTaskCreated,
		PlanID:  planID,
		Payload: task,
		UserID:  userID,
	})
	return task, nil
}

func (s *Service) UpdateTask(id string, updates map[string]interface{}, userID string) (*core.Task, error) {
	task, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	if v, ok := updates["title"].(string); ok {
		task.Title = v
	}
	if v, ok := updates["priority"].(string); ok {
		task.Priority = v
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
	if err := s.repo.Update(task); err != nil {
		return nil, err
	}
	s.eventBus.Publish(task.PlanID, core.PlanEvent{
		Type:    core.EventTaskUpdated,
		PlanID:  task.PlanID,
		Payload: task,
		UserID:  userID,
	})
	return task, nil
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
	return s.repo.FindByAssignee(userID)
}

func (s *Service) GetMyDay(userID string) ([]core.Task, error) {
	return s.repo.FindMyDay(userID)
}

func (s *Service) AddToMyDay(userID, taskID string) error {
	return s.repo.AddToMyDay(userID, taskID)
}

func (s *Service) RemoveFromMyDay(userID, taskID string) error {
	return s.repo.RemoveFromMyDay(userID, taskID)
}
