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

	// Plan handlers
	planRepo := plans.NewRepository(db)
	planService := plans.NewService(planRepo, eventBus)
	planHandler := plans.NewHandler(planService, sessionValidator)
	planHandler.RegisterRoutes(api)

	// Board (bucket) handlers
	boardRepo := boards.NewRepository(db)
	boardService := boards.NewService(boardRepo, eventBus)
	boardHandler := boards.NewHandler(boardService, sessionValidator)
	boardHandler.RegisterRoutes(api)

	// Task handlers
	taskRepo := tasks.NewRepository(db)
	taskService := tasks.NewService(taskRepo, eventBus)
	taskHandler := tasks.NewHandler(taskService, taskRepo, sessionValidator)
	taskHandler.RegisterRoutes(api)

	// Label handlers
	labelHandler := labels.NewHandler(db, sessionValidator)
	labelHandler.RegisterRoutes(api)

	// WebSocket hub
	hub := websocket.NewHub(eventBus)
	go hub.Run()
	api.GET("/ws", hub.HandleWebSocket)

	// Timeline handlers
	timelineHandler := timeline.NewHandler(db, sessionValidator)
	timelineHandler.RegisterRoutes(api)

	// Sprint handlers
	sprintHandler := sprints.NewHandler(db, sessionValidator)
	sprintHandler.RegisterRoutes(api)

	// Goal handlers
	goalHandler := goals.NewHandler(db, sessionValidator)
	goalHandler.RegisterRoutes(api)

	// Analytics handlers
	analyticsHandler := analytics.NewHandler(db, sessionValidator)
	analyticsHandler.RegisterRoutes(api)

	// Integration handlers
	integrationHandler := integration.NewHandler(db, sessionValidator)
	integrationHandler.RegisterRoutes(api)

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
