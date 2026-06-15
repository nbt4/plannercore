package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Middleware returns a gin.HandlerFunc that records Prometheus metrics for
// every HTTP request.  It uses c.FullPath() for the route pattern (so you
// get "/api/v1/planner/:planId/tasks" instead of the concrete path) and
// c.Writer.Status() for the HTTP status code.
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Process the request
		c.Next()

		// After the request, record the metrics
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path // fallback for unmatched routes
		}
		method := c.Request.Method
		status := strconv.Itoa(c.Writer.Status())

		HTTPRequestsTotal.WithLabelValues(method, path, status).Inc()
		HTTPRequestDuration.WithLabelValues(method, path).Observe(time.Since(start).Seconds())
	}
}
