package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"plannercore/internal/core"

	"github.com/gin-gonic/gin"
	gorilla "github.com/gorilla/websocket"
)

var upgrader = gorilla.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Hub struct {
	eventBus *core.EventBus
	clients  map[string]map[*Client]bool
	mu       sync.RWMutex
}

type Client struct {
	hub    *Hub
	planID string
	conn   *gorilla.Conn
	send   chan []byte
}

func NewHub(eventBus *core.EventBus) *Hub {
	return &Hub{
		eventBus: eventBus,
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

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
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

	go client.writePump()
	go client.readPump()

	// Relay events from EventBus to WebSocket
	go func() {
		for event := range eventCh {
			data, err := json.Marshal(event)
			if err != nil {
				continue
			}
			select {
			case client.send <- data:
			default:
				// drop if buffer full
			}
		}
	}()

	// Cleanup on disconnect
	go func() {
		<-c.Request.Context().Done()
		h.eventBus.Unsubscribe(planID, eventCh)
		h.unregister(client)
		client.conn.Close()
	}()
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(gorilla.TextMessage, msg); err != nil {
			return
		}
	}
}

func (c *Client) readPump() {
	defer c.conn.Close()
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
	}
}
