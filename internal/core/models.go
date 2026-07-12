package core

import (
	"encoding/json"
	"time"
)

// Plan represents a planner board/plan.
type Plan struct {
	ID              string     `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	Name            string     `json:"name" gorm:"not null"`
	Description     string     `json:"description"`
	BackgroundColor string     `json:"backgroundColor" gorm:"column:background_color;default:'#1e293b'"`
	IsFavorite      bool       `json:"isFavorite" gorm:"column:is_favorite;default:false"`
	IsTemplate      bool       `json:"isTemplate" gorm:"column:is_template;default:false"`
	CreatedBy       string     `json:"createdBy" gorm:"column:created_by"`
	CreatedAt       time.Time `json:"createdAt" gorm:"column:created_at;default:now()"`
	UpdatedAt       time.Time `json:"updatedAt" gorm:"column:updated_at;default:now()"`
	ArchivedAt      *time.Time `json:"archivedAt" gorm:"column:archived_at"`
	Buckets         []Bucket   `json:"buckets,omitempty" gorm:"foreignKey:PlanID"`
	Labels          []Label    `json:"labels,omitempty" gorm:"foreignKey:PlanID"`
	Members         []Member   `json:"members,omitempty" gorm:"foreignKey:PlanID"`
}

func (Plan) TableName() string {
	return "planner_plans"
}

// Member represents a user membership in a plan.
type Member struct {
	PlanID string `json:"planId" gorm:"column:plan_id;primaryKey"`
	UserID string `json:"userId" gorm:"column:user_id;primaryKey"`
	Role   string `json:"role" gorm:"default:'member'"`
}

func (Member) TableName() string {
	return "planner_members"
}

// Bucket represents a column/list within a plan.
type Bucket struct {
	ID        string    `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID    string    `json:"planId" gorm:"column:plan_id;index"`
	Name      string    `json:"name" gorm:"not null"`
	Position  float64   `json:"position" gorm:"not null;default:0"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;default:now()"`
	Tasks     []Task    `json:"tasks" gorm:"foreignKey:BucketID"`
}

func (Bucket) TableName() string {
	return "planner_buckets"
}

// Task represents a task/card within a bucket.
type Task struct {
	ID                     string           `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID                 string           `json:"planId" gorm:"column:plan_id;index"`
	BucketID               *string          `json:"bucketId" gorm:"column:bucket_id"`
	Title                  string           `json:"title" gorm:"not null"`
	RichTextNotes          string           `json:"richTextNotes" gorm:"column:rich_text_notes"`
	Priority               string           `json:"priority" gorm:"default:'medium'"`
	Progress               int              `json:"progress" gorm:"default:0;check:progress >= 0 AND progress <= 100"`
	StartDate              *time.Time       `json:"startDate" gorm:"column:start_date"`
	DueDate                *time.Time       `json:"dueDate" gorm:"column:due_date"`
	CompletedAt            *time.Time       `json:"completedAt" gorm:"column:completed_at"`
	Position               float64          `json:"position" gorm:"not null;default:0"`
	ChecklistCompletedCount int             `json:"checklistCompletedCount" gorm:"column:checklist_completed_count;default:0"`
	ChecklistTotalCount    int              `json:"checklistTotalCount" gorm:"column:checklist_total_count;default:0"`
	CreatedBy              string           `json:"createdBy" gorm:"column:created_by"`
	CreatedAt              time.Time        `json:"createdAt" gorm:"column:created_at;default:now()"`
	UpdatedAt              time.Time        `json:"updatedAt" gorm:"column:updated_at;default:now()"`
	Assignees              []TaskAssignee   `json:"assignees" gorm:"foreignKey:TaskID"`
	ChecklistItems         []ChecklistItem  `json:"checklistItems" gorm:"foreignKey:TaskID"`
	Labels                 []TaskLabel      `json:"labels" gorm:"foreignKey:TaskID"`
	Comments               []Comment        `json:"comments" gorm:"foreignKey:TaskID"`
	Attachments            []Attachment     `json:"attachments" gorm:"foreignKey:TaskID"`
}

func (Task) TableName() string {
	return "planner_tasks"
}

// ChecklistItem represents a single item in a task's checklist.
type ChecklistItem struct {
	ID          string     `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	TaskID      string     `json:"taskId" gorm:"column:task_id;index"`
	Title       string     `json:"title" gorm:"not null"`
	IsCompleted bool       `json:"isCompleted" gorm:"column:is_completed;default:false"`
	Position    int        `json:"position" gorm:"default:0"`
	CompletedBy string     `json:"completedBy" gorm:"column:completed_by"`
	CompletedAt *time.Time `json:"completedAt" gorm:"column:completed_at"`
	CreatedAt   time.Time  `json:"createdAt" gorm:"column:created_at;default:now()"`
}

func (ChecklistItem) TableName() string {
	return "planner_checklist_items"
}

// Label represents a label/tag for tasks within a plan.
type Label struct {
	ID     string `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID string `json:"planId" gorm:"column:plan_id;index"`
	Name   string `json:"name" gorm:"not null"`
	Color  string `json:"color" gorm:"not null"`
}

func (Label) TableName() string {
	return "planner_labels"
}

// TaskLabel is the join table between tasks and labels.
type TaskLabel struct {
	TaskID  string `json:"taskId" gorm:"column:task_id;primaryKey"`
	LabelID string `json:"labelId" gorm:"column:label_id;primaryKey"`
}

func (TaskLabel) TableName() string {
	return "planner_task_labels"
}

// TaskAssignee is the join table between tasks and users.
type TaskAssignee struct {
	TaskID string `json:"taskId" gorm:"column:task_id;primaryKey"`
	UserID string `json:"userId" gorm:"column:user_id;primaryKey"`
}

func (TaskAssignee) TableName() string {
	return "planner_task_assignees"
}

// Comment represents a comment on a task.
type Comment struct {
	ID        string    `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	TaskID    string    `json:"taskId" gorm:"column:task_id;index"`
	UserID    string    `json:"userId" gorm:"column:user_id"`
	Content   string    `json:"content" gorm:"not null"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;default:now()"`
}

func (Comment) TableName() string {
	return "planner_comments"
}

// Attachment represents a file attached to a task.
type Attachment struct {
	ID         string    `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	TaskID     string    `json:"taskId" gorm:"column:task_id;index"`
	Filename   string    `json:"filename" gorm:"not null"`
	FilePath   string    `json:"filePath" gorm:"column:file_path;not null"`
	FileSize   int64     `json:"fileSize" gorm:"column:file_size"`
	MimeType   string    `json:"mimeType" gorm:"column:mime_type"`
	UploadedBy string    `json:"uploadedBy" gorm:"column:uploaded_by"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at;default:now()"`
}

func (Attachment) TableName() string {
	return "planner_attachments"
}

// Dependency represents a task dependency relationship.
type Dependency struct {
	ID             string      `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PredecessorID  string      `json:"predecessorId" gorm:"column:predecessor_id;index"`
	SuccessorID    string      `json:"successorId" gorm:"column:successor_id;index"`
	DependencyType string      `json:"dependencyType" gorm:"column:dependency_type;default:'finish-to-start'"`
	Lag            string      `json:"lag" gorm:"default:'0'"`
}

func (Dependency) TableName() string {
	return "planner_dependencies"
}

// Sprint represents a time-boxed sprint within a plan.
type Sprint struct {
	ID        string     `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID    string     `json:"planId" gorm:"column:plan_id;index"`
	Name      string     `json:"name" gorm:"not null"`
	Goal      string     `json:"goal"`
	StartDate *time.Time `json:"startDate" gorm:"column:start_date"`
	EndDate   *time.Time `json:"endDate" gorm:"column:end_date"`
	IsActive  bool       `json:"isActive" gorm:"column:is_active;default:false"`
	CreatedAt time.Time  `json:"createdAt" gorm:"column:created_at;default:now()"`
}

func (Sprint) TableName() string {
	return "planner_sprints"
}

// SprintTask is the join table between sprints and tasks.
type SprintTask struct {
	SprintID string `json:"sprintId" gorm:"column:sprint_id;primaryKey"`
	TaskID   string `json:"taskId" gorm:"column:task_id;primaryKey"`
}

func (SprintTask) TableName() string {
	return "planner_sprint_tasks"
}

// Goal represents a goal within a plan, optionally nested under a parent goal.
type Goal struct {
	ID           string     `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID       string     `json:"planId" gorm:"column:plan_id;index"`
	ParentGoalID *string    `json:"parentGoalId" gorm:"column:parent_goal_id"`
	Title        string     `json:"title" gorm:"not null"`
	Description  string     `json:"description"`
	Progress     int        `json:"progress" gorm:"default:0"`
	Status       string     `json:"status" gorm:"default:'not-started'"`
	CreatedAt    time.Time  `json:"createdAt" gorm:"column:created_at;default:now()"`
}

func (Goal) TableName() string {
	return "planner_goals"
}

// CustomField represents a custom field definition for a plan.
type CustomField struct {
	ID       string          `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID   string          `json:"planId" gorm:"column:plan_id;index"`
	Name     string          `json:"name" gorm:"not null"`
	FieldType string         `json:"fieldType" gorm:"column:field_type;not null"`
	Choices  json.RawMessage `json:"choices" gorm:"type:jsonb"`
	Position int             `json:"position" gorm:"default:0"`
}

func (CustomField) TableName() string {
	return "planner_custom_fields"
}

// CustomFieldValue represents the value of a custom field for a specific task.
type CustomFieldValue struct {
	FieldID string `json:"fieldId" gorm:"column:field_id;primaryKey"`
	TaskID  string `json:"taskId" gorm:"column:task_id;primaryKey"`
	Value   string `json:"value"`
}

func (CustomFieldValue) TableName() string {
	return "planner_custom_field_values"
}

// Baseline represents a snapshot of a plan at a point in time.
type Baseline struct {
	ID        string          `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID    string          `json:"planId" gorm:"column:plan_id;index"`
	Name      string          `json:"name" gorm:"not null"`
	Snapshot  json.RawMessage `json:"snapshot" gorm:"type:jsonb"`
	CreatedAt time.Time       `json:"createdAt" gorm:"column:created_at;default:now()"`
}

func (Baseline) TableName() string {
	return "planner_baselines"
}

// TaskHistory represents an audit log entry of a field change on a task.
type TaskHistory struct {
	ID           string    `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	TaskID       string    `json:"taskId" gorm:"column:task_id;index"`
	UserID       string    `json:"userId" gorm:"column:user_id"`
	FieldChanged string    `json:"fieldChanged" gorm:"column:field_changed;not null"`
	OldValue     string    `json:"oldValue" gorm:"column:old_value"`
	NewValue     string    `json:"newValue" gorm:"column:new_value"`
	ChangedAt    time.Time `json:"changedAt" gorm:"column:changed_at;default:now()"`
}

func (TaskHistory) TableName() string {
	return "planner_task_history"
}

// PlanLink represents a link from a plan to an external entity.
type PlanLink struct {
	ID         string    `json:"id" gorm:"primaryKey;default:gen_random_uuid()"`
	PlanID     string    `json:"planId" gorm:"column:plan_id;index"`
	EntityType string    `json:"entityType" gorm:"column:entity_type;not null"`
	EntityID   string    `json:"entityId" gorm:"column:entity_id;not null"`
	EntityName string    `json:"entityName" gorm:"column:entity_name"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at;default:now()"`
}

func (PlanLink) TableName() string {
	return "planner_plan_links"
}

// MyDay represents a user's "my day" task assignment.
type MyDay struct {
	UserID  string    `json:"userId" gorm:"column:user_id;primaryKey"`
	TaskID  string    `json:"taskId" gorm:"column:task_id;primaryKey"`
	AddedAt time.Time `json:"addedAt" gorm:"column:added_at;default:now()"`
}

func (MyDay) TableName() string {
	return "planner_my_day"
}
