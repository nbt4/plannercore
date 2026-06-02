package auth

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SessionValidator struct {
	db *gorm.DB
}

func NewSessionValidator(db *gorm.DB) *SessionValidator {
	return &SessionValidator{db: db}
}

type User struct {
	ID           string `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	Username     string `gorm:"unique;not null" json:"username"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	IsActive     bool   `gorm:"default:true" json:"-"`
	Role         string `gorm:"default:user" json:"role"`
}

func (User) TableName() string { return "users" }

type Session struct {
	ID        string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	UserID    string    `gorm:"not null;type:uuid"`
	Token     string    `gorm:"unique;not null"`
	ExpiresAt time.Time `gorm:"not null"`
	CreatedAt time.Time
}

func (Session) TableName() string { return "sessions" }

func (sv *SessionValidator) ValidateSession(sessionID string) (*User, bool) {
	var session Session
	if err := sv.db.Where("token = ? AND expires_at > ?", sessionID, time.Now()).First(&session).Error; err != nil {
		return nil, false
	}
	var user User
	if err := sv.db.Where("id = ? AND is_active = ?", session.UserID, true).First(&user).Error; err != nil {
		return nil, false
	}
	return &user, true
}

func (sv *SessionValidator) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID, err := c.Cookie("session_id")
		if err != nil || sessionID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}

		user, valid := sv.ValidateSession(sessionID)
		if !valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired session"})
			c.Abort()
			return
		}

		c.Set("user", user)
		c.Set("userID", user.ID)
		c.Next()
	}
}

func (sv *SessionValidator) GetCurrentUser(c *gin.Context) (*User, bool) {
	userVal, exists := c.Get("user")
	if !exists {
		return nil, false
	}
	user, ok := userVal.(*User)
	return user, ok
}

func (sv *SessionValidator) RequirePlanMember(paramName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := sv.GetCurrentUser(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}
		planID := c.Param(paramName)
		if planID == "" {
			planID = c.Query(paramName)
		}
		if planID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "plan identifier required"})
			c.Abort()
			return
		}
		var count int64
		sv.db.Model(&struct {
			PlanID string `gorm:"column:plan_id"`
			UserID string `gorm:"column:user_id"`
		}{}).Table("planner_members").Where("plan_id = ? AND user_id = ?", planID, user.ID).Count(&count)
		if count == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied — not a plan member"})
			c.Abort()
			return
		}
		c.Next()
	}
}
