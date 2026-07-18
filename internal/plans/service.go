package plans

import (
	"errors"
	"plannercore/internal/core"

	"github.com/google/uuid"
)

var (
	ErrNotOwner     = errors.New("only plan owners can manage members")
	ErrUserNotFound = errors.New("active user not found")
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

func (s *Service) ListMembers(planID string) ([]MemberView, error) {
	return s.repo.ListMembers(planID)
}

func (s *Service) AddMember(planID, ownerID, userID string) error {
	owner, err := s.repo.IsOwner(planID, ownerID)
	if err != nil {
		return err
	}
	if !owner {
		return ErrNotOwner
	}
	active, err := s.repo.UserIsActive(userID)
	if err != nil {
		return err
	}
	if !active {
		return ErrUserNotFound
	}
	return s.repo.AddMember(planID, userID)
}

func (s *Service) RemoveMember(planID, ownerID, userID string) error {
	owner, err := s.repo.IsOwner(planID, ownerID)
	if err != nil {
		return err
	}
	if !owner {
		return ErrNotOwner
	}
	return s.repo.RemoveMember(planID, userID)
}
