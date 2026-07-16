package boards

import (
	"errors"

	"plannercore/internal/core"

	"github.com/google/uuid"
	"gorm.io/gorm"
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

func (s *Service) UpdateBucket(planID, id, name string) error {
	if err := s.repo.UpdateName(planID, id, name); err != nil {
		return err
	}
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventBucketUpdated,
		PlanID:  planID,
		Payload: map[string]string{"id": id, "name": name},
	})
	return nil
}

func (s *Service) DeleteBucket(planID, id string) error {
	if err := s.repo.Delete(planID, id); err != nil {
		return err
	}
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventBucketDeleted,
		PlanID:  planID,
		Payload: map[string]string{"id": id},
	})
	return nil
}

// MoveBucket swaps the target bucket's position with its left or right
// neighbor within the same plan, ordered by position. No-op if the bucket
// is already at that edge (e.g. "left" on the first bucket).
func (s *Service) MoveBucket(planID, id, direction string) error {
	buckets, err := s.repo.ListOrdered(planID)
	if err != nil {
		return err
	}
	idx := -1
	for i, b := range buckets {
		if b.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return gorm.ErrRecordNotFound
	}
	var swapIdx int
	switch direction {
	case "left":
		if idx == 0 {
			return nil
		}
		swapIdx = idx - 1
	case "right":
		if idx == len(buckets)-1 {
			return nil
		}
		swapIdx = idx + 1
	default:
		return errors.New(`direction must be "left" or "right"`)
	}
	posA, posB := buckets[idx].Position, buckets[swapIdx].Position
	if err := s.repo.UpdatePosition(planID, buckets[idx].ID, posB); err != nil {
		return err
	}
	if err := s.repo.UpdatePosition(planID, buckets[swapIdx].ID, posA); err != nil {
		return err
	}
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventBucketUpdated,
		PlanID:  planID,
		Payload: map[string]interface{}{"id": buckets[idx].ID, "position": posB},
	})
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventBucketUpdated,
		PlanID:  planID,
		Payload: map[string]interface{}{"id": buckets[swapIdx].ID, "position": posA},
	})
	return nil
}
