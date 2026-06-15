package auth

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	commonjwt "github.com/nbt4/cores-common/pkg/jwt"
)

// JWTSecret delegates to the shared cores-common JWT secret.
// Checks CORES_JWT_SECRET first, then JWT_SECRET.
// Panics if neither is set.
func JWTSecret() string {
	return string(commonjwt.JWTSecret())
}

// Claims mirrors cores-dashboard's JWT claims structure.
type Claims struct {
	UserID   uint   `json:"uid"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
	jwt.RegisteredClaims
}

// User matches the existing users table (integer PK).
type User struct {
	UserID       uint   `gorm:"column:userid;primaryKey"`
	Username     string `gorm:"column:username"`
	PasswordHash string `gorm:"column:password_hash"`
	Email        string `gorm:"column:email"`
	IsActive     bool   `gorm:"column:is_active"`
	IsAdmin      bool   `gorm:"column:is_admin"`
}

func (User) TableName() string { return "users" }

type SessionValidator struct {
	db *gorm.DB
}

func NewSessionValidator(db *gorm.DB) *SessionValidator {
	return &SessionValidator{db: db}
}

// ValidateJWT parses the cores_token JWT and returns the user if valid and active in DB.
func (sv *SessionValidator) ValidateJWT(tokenString string) (*User, bool) {
	claims, ok := commonjwt.ValidateToken(tokenString)
	if !ok {
		return nil, false
	}

	var user User
	if err := sv.db.Where("userid = ? AND is_active = ?", claims.UserID, true).First(&user).Error; err != nil {
		return nil, false
	}
	return &user, true
}

// Middleware validates the cores_token JWT cookie on every request.
func (sv *SessionValidator) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try cookie first (same-origin), then Authorization header (API clients)
		tokenString := ""
		if cookie, err := c.Cookie("cores_token"); err == nil && cookie != "" {
			tokenString = cookie
		} else if authHeader := c.GetHeader("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}

		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}

		user, valid := sv.ValidateJWT(tokenString)
		if !valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}

		userIDStr := fmt.Sprintf("%d", user.UserID)
		c.Set("user", user)
		c.Set("userID", user.UserID)
		c.Set("userIDStr", userIDStr)
		c.Set("username", user.Username)
		c.Next()
	}
}

// GetCurrentUser extracts the authenticated user from the gin context.
func (sv *SessionValidator) GetCurrentUser(c *gin.Context) (*User, bool) {
	userVal, exists := c.Get("user")
	if !exists {
		return nil, false
	}
	user, ok := userVal.(*User)
	return user, ok
}

// GetCurrentUserIDStr returns the authenticated user's ID as a string (for DB queries).
func (sv *SessionValidator) GetCurrentUserIDStr(c *gin.Context) string {
	if s, ok := c.Get("userIDStr"); ok {
		return s.(string)
	}
	return ""
}

// RequirePlanMember checks that the authenticated user is a member of the plan.
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
		sv.db.Table("planner_members").Where("plan_id = ? AND user_id = ?", planID, fmt.Sprintf("%d", user.UserID)).Count(&count)
		if count == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied — not a plan member"})
			c.Abort()
			return
		}
		c.Next()
	}
}
