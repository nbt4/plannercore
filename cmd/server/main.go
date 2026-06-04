package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"plannercore/internal/analytics"
	"plannercore/internal/auth"
	"plannercore/internal/boards"
	"plannercore/internal/core"
	"plannercore/internal/goals"
	"plannercore/internal/integration"
	"plannercore/internal/labels"
	"plannercore/internal/plans"
	"plannercore/internal/sprints"
	"plannercore/internal/tasks"
	"plannercore/internal/timeline"
	"plannercore/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	dbHost := envOrDefault("DB_HOST", "localhost")
	dbPort := envOrDefault("DB_PORT", "5432")
	dbName := envOrDefault("DB_NAME", "rentalcore")
	dbUser := envOrDefault("DB_USER", "rentalcore")
	dbPass := envOrDefault("DB_PASS", "rentalcore")

	dsn := "host=" + dbHost + " port=" + dbPort + " user=" + dbUser +
		" password=" + dbPass + " dbname=" + dbName + " sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	eventBus := core.NewEventBus()
	sessionValidator := auth.NewSessionValidator(db)

	r := gin.Default()
	r.SetTrustedProxies([]string{"127.0.0.1", "10.0.0.0/8", "172.16.0.0/12"})

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "plannercore"})
	})

	// Login/Logout (same logic as cores-dashboard)
	r.POST("/api/v1/auth/login", func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		var user auth.User
		if err := db.Where("username = ? AND is_active = ?", req.Username, true).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		claims := &auth.Claims{
			UserID:   user.UserID,
			Username: user.Username,
			IsAdmin:  user.IsAdmin,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
			},
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, err := token.SignedString([]byte(auth.JWTSecret()))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Token error"})
			return
		}

		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie("cores_token", signed, 86400, "/", "", false, true)
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"username": user.Username,
			"is_admin": user.IsAdmin,
		})
	})

	r.POST("/api/v1/auth/logout", func(c *gin.Context) {
		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie("cores_token", "", -1, "/", "", false, true)
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	api := r.Group("/api/v1/planner")
	api.Use(sessionValidator.Middleware())

	// Me endpoint - returns current user info (for auth check)
	api.GET("/me", func(c *gin.Context) {
		user, _ := sessionValidator.GetCurrentUser(c)
		c.JSON(200, gin.H{
			"userId":   fmt.Sprintf("%d", user.UserID),
			"username": user.Username,
			"isAdmin":  user.IsAdmin,
		})
	})

	// Plan-scoped routes require plan membership
	planRoutes := api.Group("")
	planRoutes.Use(sessionValidator.RequirePlanMember("planId"))

	// Plan handlers (plan-scoped)
	planRepo := plans.NewRepository(db)
	planService := plans.NewService(planRepo, eventBus)
	planHandler := plans.NewHandler(planService, sessionValidator)
	planHandler.RegisterRoutes(api)

	// Board (bucket) handlers (plan-scoped)
	boardRepo := boards.NewRepository(db)
	boardService := boards.NewService(boardRepo, eventBus)
	boardHandler := boards.NewHandler(boardService, sessionValidator)
	boardHandler.RegisterRoutes(planRoutes)

	// Task handlers (mixed: list/create are plan-scoped, task/:id operations check internally)
	taskRepo := tasks.NewRepository(db)
	taskService := tasks.NewService(taskRepo, eventBus)
	taskHandler := tasks.NewHandler(taskService, taskRepo, sessionValidator)
	taskHandler.RegisterRoutes(api)

	// Label handlers (plan-scoped)
	labelHandler := labels.NewHandler(db, sessionValidator)
	labelHandler.RegisterRoutes(planRoutes)

	// WebSocket hub
	hub := websocket.NewHub(eventBus, db)
	go hub.Run()
	planRoutes.GET("/ws", hub.HandleWebSocket)

	// Timeline handlers (plan-scoped)
	timelineHandler := timeline.NewHandler(db, sessionValidator)
	timelineHandler.RegisterRoutes(planRoutes)

	// Sprint handlers (plan-scoped)
	sprintHandler := sprints.NewHandler(db, sessionValidator)
	sprintHandler.RegisterRoutes(planRoutes)

	// Goal handlers (plan-scoped)
	goalHandler := goals.NewHandler(db, sessionValidator)
	goalHandler.RegisterRoutes(planRoutes)

	// Analytics handlers (plan-scoped)
	analyticsHandler := analytics.NewHandler(db, sessionValidator)
	analyticsHandler.RegisterRoutes(planRoutes)

	// Integration handlers (plan-scoped)
	integrationHandler := integration.NewHandler(db, sessionValidator)
	integrationHandler.RegisterRoutes(planRoutes)

	// Serve static assets (both /assets and /planner/assets for cached clients)
	r.Static("/assets", "./web/dist/assets")
	r.Static("/planner/assets", "./web/dist/assets")

	// SPA fallback for /planner/* (cached clients with old base path)
	r.NoRoute(func(c *gin.Context) {
		c.File("web/dist/index.html")
	})

	port := envOrDefault("PORT", "8080")
	log.Printf("Plannercore starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func envOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
