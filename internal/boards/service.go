package boards

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

func (s *Service) GetBuckets(planID string) ([]core.Bucket, error) {
	return s.repo.FindByPlanID(planID)
}

func (s *Service) CreateBucket(planID, name string) (*core.Bucket, error) {
	bucket := &core.Bucket{ID: uuid.New().String(), PlanID: planID, Name: name}
	if err := s.repo.Create(bucket); err != nil {
		return nil, err
	}
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventBucketCreated,
		PlanID:  planID,
		Payload: bucket,
	})
	return bucket, nil
}

func (s *Service) UpdateBucket(id, name string) error {
	return s.repo.Update(&core.Bucket{ID: id, Name: name})
}

func (s *Service) DeleteBucket(id string) error {
	return s.repo.Delete(id)
}
