package boards

import (
	"plannercore/internal/core"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindByPlanID(planID string) ([]core.Bucket, error) {
	var buckets []core.Bucket
	err := r.db.Where("plan_id = ?", planID).Order("position ASC").
		Preload("Tasks", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC").Preload("Assignees").Preload("Labels")
		}).Find(&buckets).Error
	return buckets, err
}

func (r *Repository) Create(bucket *core.Bucket) error {
	var maxPos float64
	r.db.Model(&core.Bucket{}).Where("plan_id = ?", bucket.PlanID).
		Select("COALESCE(MAX(position), 0)").Scan(&maxPos)
	bucket.Position = maxPos + 1000.0
	return r.db.Create(bucket).Error
}

func (r *Repository) Update(bucket *core.Bucket) error {
	return r.db.Save(bucket).Error
}

// UpdateName renames a bucket, scoped to planID so a member of one plan
// cannot rename a bucket belonging to a different plan by guessing its ID.
func (r *Repository) UpdateName(planID, id, name string) error {
	res := r.db.Model(&core.Bucket{}).Where("id = ? AND plan_id = ?", id, planID).Update("name", name)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *Repository) ListOrdered(planID string) ([]core.Bucket, error) {
	var buckets []core.Bucket
	err := r.db.Where("plan_id = ?", planID).Order("position ASC").Find(&buckets).Error
	return buckets, err
}

// UpdatePosition is scoped to planID for the same reason as UpdateName.
func (r *Repository) UpdatePosition(planID, id string, position float64) error {
	res := r.db.Model(&core.Bucket{}).Where("id = ? AND plan_id = ?", id, planID).Update("position", position)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Reorder writes one complete, deterministic bucket order in a transaction.
// Locking the plan's rows prevents two clients from interleaving position
// updates and leaving duplicate or partially applied positions behind.
func (r *Repository) Reorder(planID string, orderedIDs []string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var buckets []core.Bucket
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("plan_id = ?", planID).
			Order("position ASC, id ASC").
			Find(&buckets).Error; err != nil {
			return err
		}
		if err := validateBucketOrder(buckets, orderedIDs); err != nil {
			return err
		}

		for index, id := range orderedIDs {
			position := float64(index * 1000)
			result := tx.Model(&core.Bucket{}).
				Where("id = ? AND plan_id = ?", id, planID).
				Update("position", position)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return ErrInvalidBucketOrder
			}
		}
		return nil
	})
}

func validateBucketOrder(buckets []core.Bucket, orderedIDs []string) error {
	if len(buckets) != len(orderedIDs) {
		return ErrInvalidBucketOrder
	}
	existing := make(map[string]struct{}, len(buckets))
	for _, bucket := range buckets {
		existing[bucket.ID] = struct{}{}
	}
	seen := make(map[string]struct{}, len(orderedIDs))
	for _, id := range orderedIDs {
		if _, ok := existing[id]; !ok {
			return ErrInvalidBucketOrder
		}
		if _, duplicate := seen[id]; duplicate {
			return ErrInvalidBucketOrder
		}
		seen[id] = struct{}{}
	}
	return nil
}

// Delete is scoped to planID for the same reason as UpdateName.
func (r *Repository) Delete(planID, id string) error {
	res := r.db.Where("plan_id = ?", planID).Delete(&core.Bucket{}, "id = ?", id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
