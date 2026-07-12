package boards

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
