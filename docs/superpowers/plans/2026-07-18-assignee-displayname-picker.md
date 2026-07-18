# Assignee-Anzeigename-Fix (Outlook-Style Picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix assignee display names/avatars so they survive a page reload (today they degrade to the raw numeric user ID), and polish the existing assignee picker with keyboard navigation and email display.

**Architecture:** Backend live-joins `users` + `user_profiles` to hydrate every `TaskAssignee` with `username`/`email`/`avatarUrl` at read time (no schema change, no denormalization) via a new `hydrateAssignees` step folded into the existing `annotate`/`annotateAll` pattern in `internal/tasks/service.go`. The `/users` search endpoint gains the same two fields. Frontend wires the now-reliable `avatarUrl` through to the already image-capable `Avatar` component, and adds arrow-key navigation + an email line to the picker dropown in `TaskDetailPanel.tsx`.

**Tech Stack:** Go + Gin + GORM (Postgres), React + TypeScript, Vite. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-assignee-displayname-picker-design.md`.
- No Microsoft 365 / Azure AD integration in this plan — reads only whatever is already in the shared `users` / `user_profiles` tables (deferred to a separate "MS-Tenant-Sync" project).
- No new Go or npm dependencies (matches the WebSocket live-sync plan's established constraint).
- This package (`internal/tasks`) has zero existing automated backend tests (`go test ./...` reports "no test files"), and the project has no Postgres test-container setup — adding one here would be new infrastructure, not a fix. Backend changes are verified manually in Task 8, matching how the WebSocket live-sync plan verified its own backend changes (disposable local Postgres + real HTTP calls).
- Frontend has no component-test framework — only a pure-function `node:test` suite (`web/src/lib/plannerEvents.test.ts`). The one piece of genuinely testable new logic (arrow-key wrap-around) is extracted into its own pure function and tested the same way; everything else is verified manually in Task 8.
- `CommentsSection.tsx` (`comment.username` — `Comment` has no username column, same root cause, different code path) and `PeopleView.tsx`/analytics `WorkloadChart` (already resolves usernames via a per-ID lookup in `internal/analytics/handler.go:102`, just never returns `avatarUrl`) are **out of scope** — flagged here as pre-existing, non-regressing gaps, not silently fixed.

---

### Task 1: Backend — add display fields to `TaskAssignee`

**Files:**
- Modify: `internal/core/models.go:150-158`

**Interfaces:**
- Produces: `core.TaskAssignee` gains `Username string`, `Email string`, `AvatarURL string` fields (JSON-only, `gorm:"-"`, not persisted) — consumed by Task 2's hydration step and read directly by frontend code in Tasks 6–7 as `a.username` / `a.email` / `a.avatarUrl`.

- [ ] **Step 1: Add the three display fields**

Replace:

```go
// TaskAssignee is the join table between tasks and users.
type TaskAssignee struct {
	TaskID string `json:"taskId" gorm:"column:task_id;primaryKey"`
	UserID string `json:"userId" gorm:"column:user_id;primaryKey"`
}
```

with:

```go
// TaskAssignee is the join table between tasks and users. Username, Email,
// and AvatarURL are never persisted here (gorm:"-") — they're hydrated at
// read time from the shared users/user_profiles tables by
// tasks.Service.hydrateAssignees, so they always reflect the current
// display name/avatar instead of going stale if a user's profile changes
// after they were assigned.
type TaskAssignee struct {
	TaskID    string `json:"taskId" gorm:"column:task_id;primaryKey"`
	UserID    string `json:"userId" gorm:"column:user_id;primaryKey"`
	Username  string `json:"username" gorm:"-"`
	Email     string `json:"email" gorm:"-"`
	AvatarURL string `json:"avatarUrl" gorm:"-"`
}
```

- [ ] **Step 2: Build to verify the struct still compiles**

Run: `go build ./...`
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git add internal/core/models.go
git commit -m "feat: add display fields to TaskAssignee (hydrated, not persisted)"
```

---

### Task 2: Backend — hydrate assignees in the tasks service

**Files:**
- Modify: `internal/tasks/service.go:21-40` (the `annotate`/`annotateAll` functions), and every call site listed below
- Modify: `internal/tasks/handler.go` — no code change, but confirm `publishTaskUpdated` (added in the WebSocket live-sync work) picks this up for free since it calls `h.service.GetTask`

**Interfaces:**
- Consumes: `core.TaskAssignee.Username/Email/AvatarURL` (Task 1), `s.repo.db *gorm.DB` (existing private field, same package).
- Produces: `(s *Service) annotate(task *core.Task) *core.Task` and `(s *Service) annotateAll(tasks []core.Task) []core.Task` (converted from package functions to `Service` methods — every existing call site in this file must change from `annotate(x)`/`annotateAll(x)` to `s.annotate(x)`/`s.annotateAll(x)`).

- [ ] **Step 1: Convert `annotate`/`annotateAll` to methods and add `hydrateAssignees`**

Replace:

```go
// annotate populates a task's computed Status/IsLate fields before it's
// returned to a caller. Every service method that returns Task(s) must
// route through this (or annotateAll) — the fields are gorm:"-" so they're
// otherwise left zero-valued straight out of the repository.
func annotate(task *core.Task) *core.Task {
	if task == nil {
		return task
	}
	task.Status = task.ComputedStatus()
	task.IsLate = task.ComputeIsLate()
	return task
}

func annotateAll(tasks []core.Task) []core.Task {
	for i := range tasks {
		tasks[i].Status = tasks[i].ComputedStatus()
		tasks[i].IsLate = tasks[i].ComputeIsLate()
	}
	return tasks
}
```

with:

```go
// annotate populates a task's computed Status/IsLate fields, and hydrates
// its assignees' display data, before it's returned to a caller. Every
// service method that returns Task(s) must route through this (or
// annotateAll) — Status/IsLate/assignee display fields are all gorm:"-",
// so they're otherwise left zero-valued straight out of the repository.
func (s *Service) annotate(task *core.Task) *core.Task {
	if task == nil {
		return task
	}
	task.Status = task.ComputedStatus()
	task.IsLate = task.ComputeIsLate()
	s.hydrateAssignees([]core.Task{*task})
	return task
}

func (s *Service) annotateAll(tasks []core.Task) []core.Task {
	for i := range tasks {
		tasks[i].Status = tasks[i].ComputedStatus()
		tasks[i].IsLate = tasks[i].ComputeIsLate()
	}
	s.hydrateAssignees(tasks)
	return tasks
}

// assigneeInfoRow is a scratch scan target for hydrateAssignees' batched
// lookup — never persisted, exists only to receive the joined columns.
type assigneeInfoRow struct {
	UserID    string
	Username  string
	Email     string
	AvatarURL string
}

// hydrateAssignees looks up username/email/avatarUrl for every distinct
// assignee across the given tasks in a single query, and writes them onto
// each TaskAssignee's display fields in place. Best-effort: a lookup
// failure leaves display fields blank rather than failing the caller — the
// task data itself already loaded successfully, which is what matters most.
// users.userid is an integer column; TaskAssignee.UserID stores its string
// form (e.g. "42"), so the join key is cast to text to match.
func (s *Service) hydrateAssignees(tasks []core.Task) {
	ids := map[string]bool{}
	for _, t := range tasks {
		for _, a := range t.Assignees {
			ids[a.UserID] = true
		}
	}
	if len(ids) == 0 {
		return
	}
	idList := make([]string, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}

	var rows []assigneeInfoRow
	err := s.repo.db.Table("users").
		Select("CAST(users.userid AS TEXT) AS user_id, users.username, users.email, user_profiles.avatar_url").
		Joins("LEFT JOIN user_profiles ON user_profiles.user_id = users.userid").
		Where("CAST(users.userid AS TEXT) IN ?", idList).
		Scan(&rows).Error
	if err != nil {
		return
	}

	info := make(map[string]assigneeInfoRow, len(rows))
	for _, r := range rows {
		info[r.UserID] = r
	}
	for ti := range tasks {
		for ai := range tasks[ti].Assignees {
			if r, ok := info[tasks[ti].Assignees[ai].UserID]; ok {
				tasks[ti].Assignees[ai].Username = r.Username
				tasks[ti].Assignees[ai].Email = r.Email
				tasks[ti].Assignees[ai].AvatarURL = r.AvatarURL
			}
		}
	}
}
```

- [ ] **Step 2: Update every call site in this file**

In `ListTasks` (was `return annotateAll(tasks), nil`):

```go
func (s *Service) ListTasks(planID, bucketID, labelID, assigneeID string) ([]core.Task, error) {
	tasks, err := s.repo.FindByPlanID(planID, bucketID, labelID, assigneeID)
	if err != nil {
		return nil, err
	}
	return s.annotateAll(tasks), nil
}
```

In `GetTask` (was `return annotate(task), nil`):

```go
func (s *Service) GetTask(id string) (*core.Task, error) {
	task, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	return s.annotate(task), nil
}
```

In `CreateTask` (was `annotate(task)`):

```go
	if err := s.repo.Create(task); err != nil {
		return nil, err
	}
	s.annotate(task)
```

In `UpdateTask` (was `annotate(task)`):

```go
	if err := s.repo.Update(task); err != nil {
		return nil, err
	}
	s.annotate(task)
```

In `spinOffRecurrence` (was `annotate(next)`):

```go
	s.repo.CopyAssignees(completed.ID, next.ID)
	s.annotate(next)
```

In `recomputeProgress` (was `annotate(task)`):

```go
	if err := s.repo.Update(task); err != nil {
		return err
	}
	s.annotate(task)
```

In `GetMyTasks` and `GetMyDay` (both were `return annotateAll(tasks), nil` — change both occurrences):

```go
	return s.annotateAll(tasks), nil
```

- [ ] **Step 3: Build to verify every call site was updated**

Run: `go build ./...`
Expected: exits 0. If it fails with "undefined: annotate" or "undefined: annotateAll", a call site was missed — search with `grep -n "[^.]annotate(" internal/tasks/service.go` and `grep -n "[^.]annotateAll(" internal/tasks/service.go` and fix any remaining bare (non-`s.`) calls.

- [ ] **Step 4: Commit**

```bash
git add internal/tasks/service.go
git commit -m "feat: hydrate assignee username/email/avatarUrl on every task read"
```

---

### Task 3: Backend — extend the `/users` search endpoint

**Files:**
- Modify: `cmd/server/main.go:166-183`

**Interfaces:**
- Produces: `GET /api/v1/planner/users?q=...` response entries change from `{userId, username}` to `{userId, username, email, avatarUrl}` — consumed by the frontend picker in Task 7 and by `plannerApi.ts`'s type in Task 5.

- [ ] **Step 1: Add the join and extra fields**

Replace:

```go
	// Users endpoint - searches active cores users for assignee suggestions.
	api.GET("/users", func(c *gin.Context) {
		q := c.Query("q")
		query := db.Where("is_active = ?", true)
		if q != "" {
			like := "%" + q + "%"
			query = query.Where("username ILIKE ? OR email ILIKE ?", like, like)
		}
		var users []auth.User
		if err := query.Order("username ASC").Limit(20).Find(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		result := make([]gin.H, len(users))
		for i, u := range users {
			result[i] = gin.H{"userId": fmt.Sprintf("%d", u.UserID), "username": u.Username}
		}
		c.JSON(http.StatusOK, result)
	})
```

with:

```go
	// Users endpoint - searches active cores users for assignee suggestions.
	// avatarUrl comes from the shared user_profiles table (optional — left
	// blank when a user has no profile row yet).
	api.GET("/users", func(c *gin.Context) {
		q := c.Query("q")
		query := db.Where("is_active = ?", true)
		if q != "" {
			like := "%" + q + "%"
			query = query.Where("username ILIKE ? OR email ILIKE ?", like, like)
		}
		var users []auth.User
		if err := query.Order("username ASC").Limit(20).Find(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		avatarByUserID := map[string]string{}
		if len(users) > 0 {
			ids := make([]string, len(users))
			for i, u := range users {
				ids[i] = fmt.Sprintf("%d", u.UserID)
			}
			var profiles []struct {
				UserID    string
				AvatarURL string
			}
			db.Table("user_profiles").
				Select("CAST(user_id AS TEXT) AS user_id, avatar_url").
				Where("CAST(user_id AS TEXT) IN ?", ids).
				Scan(&profiles)
			for _, p := range profiles {
				avatarByUserID[p.UserID] = p.AvatarURL
			}
		}
		result := make([]gin.H, len(users))
		for i, u := range users {
			userID := fmt.Sprintf("%d", u.UserID)
			result[i] = gin.H{
				"userId":    userID,
				"username":  u.Username,
				"email":     u.Email,
				"avatarUrl": avatarByUserID[userID],
			}
		}
		c.JSON(http.StatusOK, result)
	})
```

- [ ] **Step 2: Build to verify**

Run: `go build ./...`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add cmd/server/main.go
git commit -m "feat: /users search endpoint returns email and avatarUrl"
```

---

### Task 4: Frontend — pure helper for picker keyboard navigation (TDD)

**Files:**
- Create: `web/src/lib/pickerNavigation.ts`
- Test: `web/src/lib/pickerNavigation.test.ts`

**Interfaces:**
- Produces: `nextHighlightedIndex(current: number, length: number, direction: 'up' | 'down'): number` — consumed by `TaskDetailPanel.tsx` in Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextHighlightedIndex } from './pickerNavigation';

test('down moves to the next index', () => {
  assert.equal(nextHighlightedIndex(0, 3, 'down'), 1);
});

test('down wraps from the last index back to 0', () => {
  assert.equal(nextHighlightedIndex(2, 3, 'down'), 0);
});

test('up moves to the previous index', () => {
  assert.equal(nextHighlightedIndex(1, 3, 'up'), 0);
});

test('up wraps from 0 back to the last index', () => {
  assert.equal(nextHighlightedIndex(0, 3, 'up'), 2);
});

test('a single-item list always stays at index 0', () => {
  assert.equal(nextHighlightedIndex(0, 1, 'down'), 0);
  assert.equal(nextHighlightedIndex(0, 1, 'up'), 0);
});

test('an empty list stays at index 0 (no suggestions to highlight)', () => {
  assert.equal(nextHighlightedIndex(0, 0, 'down'), 0);
  assert.equal(nextHighlightedIndex(0, 0, 'up'), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test src/lib/pickerNavigation.test.ts`
Expected: FAIL — `Cannot find module './pickerNavigation'` (file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

```typescript
// Computes the next highlighted suggestion index for an Outlook/Teams-style
// people picker dropdown: arrow keys move the highlight and wrap around at
// both ends instead of stopping dead at the first/last item.
export function nextHighlightedIndex(
  current: number,
  length: number,
  direction: 'up' | 'down',
): number {
  if (length <= 1) return 0;
  if (direction === 'down') return (current + 1) % length;
  return (current - 1 + length) % length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node --test src/lib/pickerNavigation.test.ts`
Expected: `pass 6`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/pickerNavigation.ts web/src/lib/pickerNavigation.test.ts
git commit -m "feat: add pure helper for picker arrow-key navigation"
```

---

### Task 5: Frontend — widen shared types for the new fields

**Files:**
- Modify: `web/src/services/plannerApi.ts:164-169`
- Modify: `web/src/contexts/TasksContext.tsx:130-138`

**Interfaces:**
- Consumes: nothing new (pure type-level change).
- Produces: `api.users.search` return type includes `email`/`avatarUrl`; `usePlanTasks().addAssignee`'s `user` parameter type includes `email`/`avatarUrl` — consumed by `TaskDetailPanel.tsx` in Task 7, which already passes the full suggestion object through unchanged.

- [ ] **Step 1: Widen `api.users.search`'s return type**

Replace:

```typescript
  users: {
    search: (q: string) =>
      request<{ userId: string; username: string }[]>(
        `${BASE}/users${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ),
  },
```

with:

```typescript
  users: {
    search: (q: string) =>
      request<{ userId: string; username: string; email: string; avatarUrl: string }[]>(
        `${BASE}/users${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ),
  },
```

- [ ] **Step 2: Widen `TasksContextValue.addAssignee`'s parameter type and its implementation**

In the `TasksContextValue` interface, replace:

```typescript
  addAssignee: (taskId: string, user: { userId: string; username: string }) => Promise<void>;
```

with:

```typescript
  addAssignee: (
    taskId: string,
    user: { userId: string; username: string; email?: string; avatarUrl?: string },
  ) => Promise<void>;
```

In the `addAssignee` implementation, replace:

```typescript
  const addAssignee = useCallback(async (taskId: string, user: { userId: string; username: string }) => {
```

with:

```typescript
  const addAssignee = useCallback(
    async (taskId: string, user: { userId: string; username: string; email?: string; avatarUrl?: string }) => {
```

(This only widens the accepted shape — the rest of `addAssignee`'s body, which spreads `user` as-is into the optimistic merge, needs no further change since it already stores whatever object it's given.)

- [ ] **Step 3: Type-check and build**

Run: `cd web && npm run build`
Expected: builds clean (`tsc -b && vite build` succeeds). If `addAssignee`'s closing arrow-function syntax doesn't match after the edit, fix the trailing `, []);` to align with the new multi-line signature (compare against the existing `reorderTask` callback a few lines below for the established multi-line `useCallback` formatting in this file).

- [ ] **Step 4: Commit**

```bash
git add web/src/services/plannerApi.ts web/src/contexts/TasksContext.tsx
git commit -m "feat: widen assignee types to carry email/avatarUrl through"
```

---

### Task 6: Frontend — fix TaskCard's hardcoded userId bug + wire avatarUrl in GridView

**Files:**
- Modify: `web/src/components/board/TaskCard.tsx:128`
- Modify: `web/src/components/grid/GridView.tsx:271`

**Interfaces:**
- Consumes: `a.username`/`a.avatarUrl` now reliably populated by Task 2's backend hydration.

- [ ] **Step 1: Fix `TaskCard.tsx`'s hardcoded `userId` avatar bug**

Replace:

```tsx
                <Avatar username={a.userId} size="sm" />
```

with:

```tsx
                <Avatar username={a.username || a.userId} avatarUrl={a.avatarUrl} size="sm" />
```

- [ ] **Step 2: Wire `avatarUrl` into `GridView.tsx`**

Replace:

```tsx
              <Avatar username={a.username || a.userId} size="sm" />
```

with:

```tsx
              <Avatar username={a.username || a.userId} avatarUrl={a.avatarUrl} size="sm" />
```

- [ ] **Step 3: Build to verify**

Run: `cd web && npm run build`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/board/TaskCard.tsx web/src/components/grid/GridView.tsx
git commit -m "fix: TaskCard/GridView show real assignee avatar instead of raw userId"
```

---

### Task 7: Frontend — TaskDetailPanel: assignee chip avatars + picker keyboard nav + email

**Files:**
- Modify: `web/src/components/tasks/TaskDetailPanel.tsx:32-65` (state + search effect)
- Modify: `web/src/components/tasks/TaskDetailPanel.tsx:665-681` (assignee chips)
- Modify: `web/src/components/tasks/TaskDetailPanel.tsx:696-763` (input + suggestions dropdown)

**Interfaces:**
- Consumes: `nextHighlightedIndex` from `../../lib/pickerNavigation` (Task 4); widened `assigneeSuggestions` items now carry `email`/`avatarUrl` (Task 5/3).

- [ ] **Step 1: Import the navigation helper and widen suggestion state**

Replace:

```tsx
import { X, Calendar, Users as UsersIcon, Columns3, Tags, MoreHorizontal, Trash2, Repeat } from 'lucide-react';
```

with:

```tsx
import { X, Calendar, Users as UsersIcon, Columns3, Tags, MoreHorizontal, Trash2, Repeat } from 'lucide-react';
import { nextHighlightedIndex } from '../../lib/pickerNavigation';
```

Replace:

```tsx
  const [assigneeInput, setAssigneeInput] = useState('');
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<{ userId: string; username: string }[]>([]);
```

with:

```tsx
  const [assigneeInput, setAssigneeInput] = useState('');
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<
    { userId: string; username: string; email?: string; avatarUrl?: string }[]
  >([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
```

- [ ] **Step 2: Reset the highlight whenever the suggestion list changes**

Replace:

```tsx
      api.users
        .search(query)
        .then((users) => {
          if (cancelled) return;
          const assignedIds = new Set((task?.assignees || []).map((a: any) => a.userId));
          setAssigneeSuggestions(users.filter((u) => !assignedIds.has(u.userId)));
        })
        .catch(() => {
          if (!cancelled) setAssigneeSuggestions([]);
        });
```

with:

```tsx
      api.users
        .search(query)
        .then((users) => {
          if (cancelled) return;
          const assignedIds = new Set((task?.assignees || []).map((a: any) => a.userId));
          setAssigneeSuggestions(users.filter((u) => !assignedIds.has(u.userId)));
          setHighlightedIndex(0);
        })
        .catch(() => {
          if (!cancelled) setAssigneeSuggestions([]);
        });
```

- [ ] **Step 3: Pass `avatarUrl` through on the assignee chips**

Replace:

```tsx
                      <Avatar username={a.username || a.userId} size="sm" />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {a.username || a.userId}
                      </span>
```

with:

```tsx
                      <Avatar username={a.username || a.userId} avatarUrl={a.avatarUrl} size="sm" />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {a.username || a.userId}
                      </span>
```

- [ ] **Step 4: Add arrow-key navigation to the input's `onKeyDown`**

Replace:

```tsx
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && assigneeSuggestions[0]) {
                          e.preventDefault();
                          handleAddAssignee(assigneeSuggestions[0]);
                        } else if (e.key === 'Escape') {
                          setAssigneeInput('');
                          setAssigneeSuggestions([]);
                        }
                      }}
```

with:

```tsx
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && assigneeSuggestions.length > 0) {
                          e.preventDefault();
                          setHighlightedIndex((i) =>
                            nextHighlightedIndex(i, assigneeSuggestions.length, 'down'),
                          );
                        } else if (e.key === 'ArrowUp' && assigneeSuggestions.length > 0) {
                          e.preventDefault();
                          setHighlightedIndex((i) =>
                            nextHighlightedIndex(i, assigneeSuggestions.length, 'up'),
                          );
                        } else if (e.key === 'Enter' && assigneeSuggestions[highlightedIndex]) {
                          e.preventDefault();
                          handleAddAssignee(assigneeSuggestions[highlightedIndex]);
                        } else if (e.key === 'Escape') {
                          setAssigneeInput('');
                          setAssigneeSuggestions([]);
                        }
                      }}
```

- [ ] **Step 5: Show the highlighted state, avatar, and email in each suggestion row**

Replace:

```tsx
                        {assigneeSuggestions.map((u) => (
                          <button
                            key={u.userId}
                            onClick={() => handleAddAssignee(u)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                              width: '100%',
                              padding: 'var(--space-2) var(--space-3)',
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-primary)',
                              fontSize: 'var(--text-sm)',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <Avatar username={u.username} size="sm" />
                            <span>{u.username}</span>
                          </button>
                        ))}
```

with:

```tsx
                        {assigneeSuggestions.map((u, i) => (
                          <button
                            key={u.userId}
                            onClick={() => handleAddAssignee(u)}
                            onMouseEnter={() => setHighlightedIndex(i)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                              width: '100%',
                              padding: 'var(--space-2) var(--space-3)',
                              background: i === highlightedIndex ? 'var(--surface-2)' : 'none',
                              border: 'none',
                              color: 'var(--text-primary)',
                              fontSize: 'var(--text-sm)',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <Avatar username={u.username} avatarUrl={u.avatarUrl} size="sm" />
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span>{u.username}</span>
                              {u.email && (
                                <span
                                  style={{
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {u.email}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
```

- [ ] **Step 6: Build to verify**

Run: `cd web && npm run build`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/tasks/TaskDetailPanel.tsx
git commit -m "feat: picker arrow-key navigation, email display, and real avatars"
```

---

### Task 8: Manual end-to-end verification

**Files:** none (verification only — no code changes).

**Interfaces:** none.

- [ ] **Step 1: Invoke the `verify` skill** to exercise the full change end-to-end, following the same disposable-stack methodology used for the WebSocket live-sync plan (ephemeral local Postgres seeded from `/opt/dev/cores/migrations/postgresql/000_combined_init.sql` + this repo's own migrations, backend run via `go run cmd/server/main.go`, frontend via `npm run dev`) if no browser automation tool is available in the environment at execution time; use real browser interaction if one is available.

- [ ] **Step 2: Verify the core bug fix** — add an assignee to a task, then reload the page (or refetch via a second tab): the assignee's real name and avatar (or initials, if no `avatar_url` row exists) must show, not the raw numeric user ID.

- [ ] **Step 3: Verify picker polish** — type a query that returns 3+ suggestions; confirm ArrowDown/ArrowUp move the highlighted row (with visible highlight background) and wrap around at both ends; confirm Enter adds the currently highlighted suggestion (not always the first); confirm each suggestion row shows an email line when the looked-up user has one.

- [ ] **Step 4: Regression-check** the `/users` endpoint directly (e.g. `curl -b cookies.txt ".../api/v1/planner/users?q=admin"`) to confirm the response shape is `{userId, username, email, avatarUrl}` and didn't break existing consumers.

- [ ] **Step 5: Run full test suites**

Run: `go build ./... && (cd web && npm run build && node --test)`
Expected: Go build clean; `npm run build` clean; all `node --test` tests pass (the 10 pre-existing `plannerEvents.test.ts` tests plus the 6 new `pickerNavigation.test.ts` tests).

- [ ] **Step 6: Update this plan's checkboxes and hand off to `finishing-a-development-branch`** once verification passes, following the same pattern used to close out the WebSocket live-sync branch.
