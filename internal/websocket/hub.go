package websocket

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"plannercore/internal/core"

	"github.com/gin-gonic/gin"
	gorilla "github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// FIXED: Added heartbeat/ping-pong configuration for cleanup
const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

var upgrader = gorilla.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		host := r.Host
		return origin == "" || origin == "http://"+host || origin == "https://"+host ||
			origin == "http://localhost:3003" || origin == "http://localhost:3000"
	},
}

type Hub struct {
	eventBus *core.EventBus
	db       *gorm.DB
	clients  map[string]map[*Client]bool
	mu       sync.RWMutex
}

type Client struct {
	hub    *Hub
	planID string
	conn   *gorilla.Conn
	send   chan []byte
}

func NewHub(eventBus *core.EventBus, db *gorm.DB) *Hub {
	return &Hub{
		eventBus: eventBus,
		db:       db,
		clients:  make(map[string]map[*Client]bool),
	}
}

func (h *Hub) Run() {
	// Hub runs in background; clients are managed via register/unregister
}

func (h *Hub) register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[client.planID] == nil {
		h.clients[client.planID] = make(map[*Client]bool)
	}
	h.clients[client.planID][client] = true
}

func (h *Hub) unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.clients[client.planID]; ok {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.clients, client.planID)
		}
	}
}

func (h *Hub) HandleWebSocket(c *gin.Context) {
	planID := c.Query("planId")
	if planID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "planId query parameter required"})
		return
	}

	// Verify user is a plan member (membership middleware already ran via planRoutes)
	userID := c.GetString("userIDStr")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var count int64
	h.db.Table("planner_members").Where("plan_id = ? AND user_id = ?", planID, userID).Count(&count)
	if count == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a plan member"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Error("WebSocket upgrade error", "error", err)
		return
	}

	client := &Client{
		hub:    h,
		planID: planID,
		conn:   conn,
		send:   make(chan []byte, 256),
	}

	h.register(client)

	// Subscribe to EventBus for this plan
	eventCh := h.eventBus.Subscribe(planID)

	// FIXED: goroutine lifecycle managed via done channel — ensures cleanup
	// when writePump or readPump exits (heartbeat-based detection)
	done := make(chan struct{})

	go client.writePump(done)
	go client.readPump(done)

	// Relay events from EventBus to WebSocket
	go func() {
		defer func() {
			h.eventBus.Unsubscribe(planID, eventCh)
		}()
		for {
			select {
			case event, ok := <-eventCh:
				if !ok {
					return
				}
				data, err := json.Marshal(event)
				if err != nil {
					continue
				}
				select {
				case client.send <- data:
				default:
					// drop if buffer full
				}
			case <-done:
				return
			}
		}
	}()

	// FIXED: cleanup goroutine waits for done signal from readPump/writePump
	// instead of relying solely on request context (which may not fire)
	go func() {
		<-done
		h.unregister(client)
	}()
}

// FIXED: writePump uses heartbeat-based ping to detect dead connections.
// Exits and signals done when connection is lost, triggering cleanup.
func (c *Client) writePump(done chan struct{}) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
		close(done) // signal cleanup
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// send channel closed
				c.conn.WriteMessage(gorilla.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(gorilla.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(gorilla.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// FIXED: readPump uses pong handler to detect dead connections.
// Exits and signals done when connection is lost, triggering cleanup.
func (c *Client) readPump(done chan struct{}) {
	defer func() {
		c.conn.Close()
		close(done) // signal cleanup
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if gorilla.IsUnexpectedCloseError(err, gorilla.CloseGoingAway, gorilla.CloseAbnormalClosure) {
				slog.Error("WebSocket error", "error", err)
			}
			break
		}
	}
}
