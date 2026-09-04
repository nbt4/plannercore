package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	commonbranding "github.com/nbt4/cores-common/pkg/branding"
	commonhealth "github.com/nbt4/cores-common/pkg/health"

	"plannercore/internal/analytics"
	"plannercore/internal/auth"
	"plannercore/internal/boards"
	"plannercore/internal/core"
	"plannercore/internal/goals"
	"plannercore/internal/integration"
	"plannercore/internal/labels"
	"plannercore/internal/metrics"
	"plannercore/internal/plans"
	"plannercore/internal/sprints"
	"plannercore/internal/tasks"
	"plannercore/internal/timeline"
	"plannercore/internal/websocket"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	dashboardURL := os.Getenv("DASHBOARD_URL")
	if dashboardURL == "" {
		dashboardURL = "/"
	}

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
	metrics.DBConnectionsOpen.Set(float64(sqlDB.Stats().OpenConnections))
	brandingService := commonbranding.NewService(db, "planner")

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

	// Prometheus metrics middleware
	r.Use(metrics.Middleware())

	// Health endpoint — placed BEFORE auth middleware, pings PostgreSQL
	r.GET("/health", gin.WrapH(commonhealth.Handler(sqlDB, "plannercore", "2.6.19")))
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))
	brandingHandler := func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		c.JSON(http.StatusOK, brandingService.GetConfig())
	}
	r.GET("/api/v1/branding", brandingHandler)
	r.GET("/api/v1/planner/branding", brandingHandler)

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
		cookieDomain := os.Getenv("COOKIE_DOMAIN")
		c.SetCookie("cores_token", "", -1, "/", cookieDomain, cookieDomain != "", true)
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	api := r.Group("/api/v1/planner")
	api.Use(sessionValidator.Middleware())

	// Me endpoint - returns current user info (for auth check)
	api.GET("/me", func(c *gin.Context) {
		user, _ := sessionValidator.GetCurrentUser(c)
		displayName := user.Username
		db.Raw(`SELECT COALESCE(
			NULLIF(p.display_name, ''),
			NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
			u.username
		) FROM users u LEFT JOIN user_profiles p ON p.user_id = u.userid WHERE u.userid = ?`, user.UserID).
			Scan(&displayName)
		if strings.TrimSpace(displayName) == "" {
			displayName = user.Username
		}
		c.JSON(200, gin.H{
			"userId":      fmt.Sprintf("%d", user.UserID),
			"username":    user.Username,
			"displayName": displayName,
			"isAdmin":     user.IsAdmin,
		})
	})

	// Users endpoint - searches active cores users for assignee suggestions.
	// avatarUrl comes from the shared user_profiles table (optional — left
	// blank when a user has no profile row yet).
	api.GET("/users", func(c *gin.Context) {
		q := c.Query("q")
		type userSuggestion struct {
			UserID      uint
			Username    string
			Email       string
			DisplayName string
			AvatarURL   string
		}
		query := db.Table("users u").
			Select("u.userid AS user_id, u.username, u.email, COALESCE(NULLIF(p.display_name, ''), NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username) AS display_name, COALESCE(p.avatar_url, '') AS avatar_url").
			Joins("LEFT JOIN user_profiles p ON p.user_id = u.userid").
			Where("u.is_active = ?", true)
		if q != "" {
			like := "%" + q + "%"
			query = query.Where("u.username ILIKE ? OR u.email ILIKE ? OR u.first_name ILIKE ? OR u.last_name ILIKE ? OR p.display_name ILIKE ?", like, like, like, like, like)
		}
		var users []userSuggestion
		if err := query.Order("display_name ASC, u.username ASC").Limit(20).Scan(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		result := make([]gin.H, len(users))
		for i, u := range users {
			userID := fmt.Sprintf("%d", u.UserID)
			result[i] = gin.H{
				"userId":      userID,
				"displayName": u.DisplayName,
				"username":    u.Username,
				"email":       u.Email,
				"avatarUrl":   u.AvatarURL,
			}
		}
		c.JSON(http.StatusOK, result)
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
	r.Static("/plannercore/assets", "./web/dist/assets")
	serveLogo := func(c *gin.Context) {
		filename := filepath.Base(c.Param("filepath"))
		if filename == "." || filename == "" {
			c.Status(http.StatusNotFound)
			return
		}
		for _, directory := range []string{"/var/lib/branding/logos", "./web/dist/logos"} {
			candidate := filepath.Join(directory, filename)
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				c.Header("X-Content-Type-Options", "nosniff")
				c.File(candidate)
				return
			}
		}
		c.Status(http.StatusNotFound)
	}
	r.GET("/logos/*filepath", serveLogo)
	r.GET("/planner/logos/*filepath", serveLogo)
	r.GET("/plannercore/logos/*filepath", serveLogo)
	r.Static("/app-icons", "./web/dist/app-icons")
	r.Static("/planner/app-icons", "./web/dist/app-icons")
	r.Static("/plannercore/app-icons", "./web/dist/app-icons")
	r.GET("/manifest.webmanifest", func(c *gin.Context) {
		c.Header("Content-Type", "application/manifest+json")
		c.Header("Cache-Control", "no-cache")
		c.JSON(http.StatusOK, commonbranding.Manifest(brandingService.GetConfig(), commonbranding.ManifestOptions{
			Name: "PlannerCore", StartURL: "/", Scope: "/",
			FallbackIcon192: "/app-icons/icon-192.png", FallbackIcon512: "/app-icons/icon-512.png",
			FallbackMaskable: "/app-icons/icon-maskable-512.png",
		}))
	})
	r.GET("/planner/manifest.webmanifest", func(c *gin.Context) {
		c.Header("Content-Type", "application/manifest+json")
		c.Header("Cache-Control", "no-cache")
		c.JSON(http.StatusOK, commonbranding.Manifest(brandingService.GetConfig(), commonbranding.ManifestOptions{
			Name: "PlannerCore", StartURL: "/planner/", Scope: "/planner/",
			FallbackIcon192: "/planner/app-icons/icon-192.png", FallbackIcon512: "/planner/app-icons/icon-512.png",
			FallbackMaskable: "/planner/app-icons/icon-maskable-512.png",
		}))
	})
	r.GET("/plannercore/manifest.webmanifest", func(c *gin.Context) {
		c.Header("Content-Type", "application/manifest+json")
		c.Header("Cache-Control", "no-cache")
		c.JSON(http.StatusOK, commonbranding.Manifest(brandingService.GetConfig(), commonbranding.ManifestOptions{
			Name: "PlannerCore", StartURL: "/plannercore/", Scope: "/plannercore/",
			FallbackIcon192: "/plannercore/app-icons/icon-192.png", FallbackIcon512: "/plannercore/app-icons/icon-512.png",
			FallbackMaskable: "/plannercore/app-icons/icon-maskable-512.png",
		}))
	})
	r.GET("/sw.js", func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		c.File("./web/dist/sw.js")
	})
	r.GET("/planner/sw.js", func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		c.File("./web/dist/sw.js")
	})
	r.GET("/plannercore/sw.js", func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		c.File("./web/dist/sw.js")
	})

	// SPA fallback for /planner/* (cached clients with old base path)
	// Inject DASHBOARD_URL into the served HTML so the React app can read it
	indexHTML, err := os.ReadFile("web/dist/index.html")
	if err != nil {
		slog.Error("failed to read index.html", "error", err)
	} else {
		scriptTag := fmt.Sprintf("<script>window.__DASHBOARD_URL__=%q</script>", dashboardURL)
		indexHTML = []byte(strings.Replace(string(indexHTML), "</head>", scriptTag+"</head>", 1))
	}
	r.NoRoute(func(c *gin.Context) {
		if indexHTML != nil {
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
		} else {
			c.File("web/dist/index.html")
		}
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
