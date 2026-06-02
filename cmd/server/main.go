package main

import (
	"log"
	"os"

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

	api := r.Group("/api/v1/planner")
	api.Use(sessionValidator.Middleware())

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

	// Serve static assets (JS, CSS, images) from the frontend build
	r.Static("/assets", "./web/dist/assets")

	// SPA fallback - serve index.html for all non-API routes
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
