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

func (r *Repository) UpdateName(id, name string) error {
	return r.db.Model(&core.Bucket{}).Where("id = ?", id).Update("name", name).Error
}

func (r *Repository) Delete(id string) error {
	return r.db.Delete(&core.Bucket{}, "id = ?", id).Error
}
