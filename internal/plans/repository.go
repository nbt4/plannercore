package plans

import (
	"plannercore/internal/core"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

type MemberView struct {
	PlanID    string `json:"planId"`
	UserID    string `json:"userId"`
	Role      string `json:"role"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatarUrl"`
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindAllByUser(userID string) ([]core.Plan, error) {
	var plans []core.Plan
	sub := r.db.Table("planner_members").Select("plan_id").Where("user_id = ?", userID)
	err := r.db.Where("id IN (?)", sub).Where("archived_at IS NULL").
		Order("is_favorite DESC, updated_at DESC").
		Preload("Buckets", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Preload("Buckets.Tasks", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC")
		}).
		Find(&plans).Error
	return plans, err
}

func (r *Repository) FindByID(id string) (*core.Plan, error) {
	var plan core.Plan
	err := r.db.Preload("Buckets", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC")
	}).Preload("Labels").Preload("Members").First(&plan, "id = ?", id).Error
	return &plan, err
}

func (r *Repository) Create(plan *core.Plan) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(plan).Error; err != nil {
			return err
		}
		member := core.Member{
			PlanID: plan.ID,
			UserID: plan.CreatedBy,
			Role:   "owner",
		}
		return tx.Create(&member).Error
	})
}

func (r *Repository) Update(plan *core.Plan) error {
	return r.db.Save(plan).Error
}

func (r *Repository) Delete(id string) error {
	return r.db.Delete(&core.Plan{}, "id = ?", id).Error
}

func (r *Repository) ToggleFavorite(id string) error {
	return r.db.Exec("UPDATE planner_plans SET is_favorite = NOT is_favorite WHERE id = ?", id).Error
}

func (r *Repository) IsMember(planID, userID string) (bool, error) {
	var count int64
	err := r.db.Model(&core.Member{}).Where("plan_id = ? AND user_id = ?", planID, userID).Count(&count).Error
	return count > 0, err
}

func (r *Repository) IsOwner(planID, userID string) (bool, error) {
	var count int64
	err := r.db.Model(&core.Member{}).Where("plan_id = ? AND user_id = ? AND role = ?", planID, userID, "owner").Count(&count).Error
	return count > 0, err
}

func (r *Repository) ListMembers(planID string) ([]MemberView, error) {
	var members []MemberView
	err := r.db.Table("planner_members AS m").
		Select("m.plan_id, m.user_id, m.role, u.username, u.email, COALESCE(p.avatar_url, '') AS avatar_url").
		Joins("JOIN users AS u ON CAST(u.userid AS TEXT) = m.user_id").
		Joins("LEFT JOIN user_profiles AS p ON CAST(p.user_id AS TEXT) = m.user_id").
		Where("m.plan_id = ?", planID).
		Order("CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, u.username ASC").
		Scan(&members).Error
	return members, err
}

func (r *Repository) UserIsActive(userID string) (bool, error) {
	var count int64
	err := r.db.Table("users").Where("userid = ? AND is_active = ?", userID, true).Count(&count).Error
	return count > 0, err
}

func (r *Repository) AddMember(planID, userID string) error {
	return r.db.Create(&core.Member{PlanID: planID, UserID: userID, Role: "member"}).Error
}

func (r *Repository) RemoveMember(planID, userID string) error {
	return r.db.Where("plan_id = ? AND user_id = ? AND role <> ?", planID, userID, "owner").Delete(&core.Member{}).Error
}

func (r *Repository) Copy(originalID, newID, userID string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var original core.Plan
		if err := tx.First(&original, "id = ?", originalID).Error; err != nil {
			return err
		}
		newPlan := original
		newPlan.ID = newID
		newPlan.Name = original.Name + " (Kopie)"
		newPlan.IsFavorite = false
		newPlan.CreatedBy = userID
		if err := tx.Create(&newPlan).Error; err != nil {
			return err
		}
		return tx.Create(&core.Member{PlanID: newPlan.ID, UserID: userID, Role: "owner"}).Error
	})
}
