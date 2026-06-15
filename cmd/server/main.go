package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	commonhealth "github.com/nbt4/cores-common/pkg/health"

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

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	// Structured JSON logger
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	// FIXED: default DB credentials changed from "rentalcore" to "plannercore"
	dbHost := envOrDefault("DB_HOST", "localhost")
	dbPort := envOrDefault("DB_PORT", "5432")
	dbName := envOrDefault("DB_NAME", "plannercore")
	dbUser := envOrDefault("DB_USER", "plannercore")
	dbPass := envOrDefault("DB_PASS", "plannercore")

	dsn := "host=" + dbHost + " port=" + dbPort + " user=" + dbUser +
		" password=" + dbPass + " dbname=" + dbName + " sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		slog.Error("Failed to connect to database", "error", err)
		os.Exit(1)
	}

	// Get underlying *sql.DB for health checks
	sqlDB, err := db.DB()
	if err != nil {
		slog.Error("Failed to get underlying sql.DB", "error", err)
		os.Exit(1)
	}

	eventBus := core.NewEventBus()
	sessionValidator := auth.NewSessionValidator(db)

	r := gin.Default()
	r.SetTrustedProxies([]string{"127.0.0.1", "10.0.0.0/8", "172.16.0.0/12"})

	// FIXED: Added proper CORS middleware
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3003", "http://localhost:3000", "http://localhost:8080"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Health endpoint — placed BEFORE auth middleware, pings PostgreSQL
	r.GET("/health", gin.WrapH(commonhealth.Handler(sqlDB, "plannercore", "2.1.0")))

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

		// FIXED: Use HS512 instead of HS256 for stronger security
		token := jwt.NewWithClaims(jwt.SigningMethodHS512, claims)
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

	// FIXED: Task handlers — plan-scoped list/create go to planRoutes for membership check;
	// task-scoped routes (GET/PUT/DELETE /tasks/:taskId) verify plan membership internally.
	taskRepo := tasks.NewRepository(db)
	taskService := tasks.NewService(taskRepo, eventBus)
	taskHandler := tasks.NewHandler(taskService, taskRepo, sessionValidator)
	taskHandler.RegisterRoutes(api, planRoutes)

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

	// Graceful shutdown with http.Server
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Start server in a goroutine
	go func() {
		slog.Info("Plannercore starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Failed to start server", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit

	slog.Info("Shutting down gracefully", "signal", sig.String())

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("Server exited cleanly")
}

func envOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
