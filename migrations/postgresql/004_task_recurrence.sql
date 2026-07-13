-- Plannercore Schema v1.2 — recurring tasks
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none';
