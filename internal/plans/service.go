package plans

import (
	"plannercore/internal/core"

	"github.com/google/uuid"
)

type Service struct {
	repo     *Repository
	eventBus *core.EventBus
}

func NewService(repo *Repository, eventBus *core.EventBus) *Service {
	return &Service{repo: repo, eventBus: eventBus}
}

func (s *Service) ListPlans(userID string) ([]core.Plan, error) {
	return s.repo.FindAllByUser(userID)
}

func (s *Service) GetPlan(id string) (*core.Plan, error) {
	return s.repo.FindByID(id)
}

func (s *Service) CreatePlan(name, description, userID string) (*core.Plan, error) {
	plan := &core.Plan{
		ID:          uuid.New().String(),
		Name:        name,
		Description: description,
		CreatedBy:   userID,
	}
	if err := s.repo.Create(plan); err != nil {
		return nil, err
	}
	return plan, nil
}

func (s *Service) UpdatePlan(id, name, description string) error {
	plan, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	if name != "" {
		plan.Name = name
	}
	if description != "" {
		plan.Description = description
	}
	return s.repo.Update(plan)
}

func (s *Service) DeletePlan(id string) error {
	return s.repo.Delete(id)
}

func (s *Service) ToggleFavorite(id string) error {
	return s.repo.ToggleFavorite(id)
}

func (s *Service) CopyPlan(id, userID string) (*core.Plan, error) {
	newID := uuid.New().String()
	if err := s.repo.Copy(id, newID, userID); err != nil {
		return nil, err
	}
	return s.repo.FindByID(newID)
}
