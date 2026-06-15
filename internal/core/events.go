package core

import (
	"sync"
	"time"
) // FIXED: added sync import for RWMutex

type EventType string

const (
	EventTaskCreated      EventType = "task.created"
	EventTaskMoved        EventType = "task.moved"
	EventTaskUpdated      EventType = "task.updated"
	EventTaskDeleted      EventType = "task.deleted"
	EventBucketCreated    EventType = "bucket.created"
	EventBucketUpdated    EventType = "bucket.updated"
	EventBucketDeleted    EventType = "bucket.deleted"
	EventCommentAdded     EventType = "comment.added"
	EventChecklistToggled EventType = "checklist.toggled"
	EventChecklistAdded   EventType = "checklist.added"
	EventLabelCreated     EventType = "label.created"
	EventMemberAdded      EventType = "member.added"
	EventMemberRemoved    EventType = "member.removed"
)

type PlanEvent struct {
	Type      EventType   `json:"type"`
	PlanID    string      `json:"planId"`
	Payload   interface{} `json:"payload"`
	UserID    string      `json:"userId"`
	Timestamp time.Time   `json:"timestamp"`
}

// FIXED: Added sync.RWMutex to protect all map operations from concurrent HTTP + WebSocket access
type EventBus struct {
	mu          sync.RWMutex
	subscribers map[string][]chan PlanEvent
}

func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[string][]chan PlanEvent),
	}
}

func (eb *EventBus) Subscribe(planID string) chan PlanEvent {
	// FIXED: write lock for map mutation
	eb.mu.Lock()
	defer eb.mu.Unlock()
	ch := make(chan PlanEvent, 64)
	eb.subscribers[planID] = append(eb.subscribers[planID], ch)
	return ch
}

func (eb *EventBus) Unsubscribe(planID string, ch chan PlanEvent) {
	// FIXED: write lock for map mutation
	eb.mu.Lock()
	defer eb.mu.Unlock()
	subs := eb.subscribers[planID]
	for i, sub := range subs {
		if sub == ch {
			eb.subscribers[planID] = append(subs[:i], subs[i+1:]...)
			close(ch)
			return
		}
	}
}

func (eb *EventBus) Publish(planID string, event PlanEvent) {
	// FIXED: read lock for concurrent-safe iteration
	eb.mu.RLock()
	defer eb.mu.RUnlock()
	for _, ch := range eb.subscribers[planID] {
		select {
		case ch <- event:
		default:
		}
	}
}
