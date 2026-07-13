# WebSocket Live-Sync — Design

## Problem

The frontend already opens a plan-scoped WebSocket (`WebSocketContext.tsx`,
`/api/v1/planner/ws?planId=...`) with working reconnect logic, and the
backend already publishes `task.created` / `task.updated` / `task.deleted` /
`bucket.created` / `bucket.updated` / `bucket.deleted` via `EventBus` (see
`internal/core/events.go`, `internal/tasks/service.go`,
`internal/boards/service.go`). But `lastEvent` — the parsed payload of every
incoming message — is stored in context state and never read anywhere else in
the codebase. The wiring is complete; nothing consumes it.

Compounding this, there is no shared task/bucket cache: `BoardView`,
`GridView`, `TaskDetailPanel`, `ScheduleView`, and `TimelineView` each fetch
their own independent copy of the plan's tasks via `useState`/`useEffect`.
Two existing bugs are direct symptoms of this:

- `TaskDetailPanel.handleUpdate` (status/priority/bucket/due date/title
  changes) updates only the panel's own local `task` state and never calls
  `onTaskUpdated`, so edits made in the detail panel don't appear on the
  board behind it until something unrelated triggers a refetch.
- `AddTaskInline` accepts an `onTaskAdded` callback prop, but
  `BucketColumn` never passes it when rendering `AddTaskInline` — a task
  added via the inline "+" input doesn't appear on the board until an
  unrelated refetch happens.

Additionally, `ReorderTasks` (`internal/tasks/handler.go`) and `MoveBucket`
(`internal/boards/service.go`) do not publish usable events today — the
former publishes nothing, the latter publishes `bucket.updated` with a `nil`
payload. Drag-and-drop changes are therefore invisible to other clients
regardless of frontend changes, unless fixed as part of this work.

## Design

### Architecture

A new `TasksProvider` (`web/src/contexts/TasksContext.tsx`, mirroring the
existing `WebSocketContext.tsx` / `PlanContext.tsx` pattern) becomes the
single source of truth for the **active plan's** tasks and buckets. It is
mounted in `App.tsx` inside `PlanProvider` and `WebSocketProvider`, since it
depends on `activePlanId` (initial fetch) and `lastEvent`/`connected`
(live updates).

Scope boundary: the WebSocket connection is already plan-scoped
(`ws?planId=X`), so this design only covers views scoped to one open plan.
Cross-plan aggregate pages (`MyTasksPage`, `MyDayPage`) and analytics/summary
views (`ChartsView`, `PeopleView`, `GoalsView`, which read from separate
`api.analytics.*`/`api.goals.*` endpoints, not the raw task list) are out of
scope — see "Out of scope" below.

### TasksContext — state and API surface

```ts
interface TasksContextValue {
  tasks: Task[];
  buckets: Bucket[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;

  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (taskId: string, patch: UpdateTaskInput) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  reorderTask: (taskId: string, bucketId: string, position: number) => Promise<void>;
  addAssignee: (taskId: string, userId: string) => Promise<void>;
  removeAssignee: (taskId: string, userId: string) => Promise<void>;

  createBucket: (name: string) => Promise<Bucket>;
  updateBucket: (bucketId: string, patch: UpdateBucketInput) => Promise<Bucket>;
  deleteBucket: (bucketId: string) => Promise<void>;
  moveBucket: (bucketId: string, position: number) => Promise<void>;
}
```

`Task`/`Bucket` types are reused as-is (currently defined in
`components/board/types.ts`) — no shape changes needed for this feature.

Each mutation wrapper calls the existing `api.tasks.*`/`api.buckets.*`
function, then feeds the server's response through the same reconciliation
path used for remote events (below), so a local mutation and the server's
broadcast echo of that same mutation are handled identically. Drag-and-drop
reorder keeps its current optimistic-then-revert shape: `reorderTask` applies
the new order to context state immediately, calls the API, and on failure
calls `refetch()` to restore the authoritative order — same behavior as
today's `BoardView.handleDragEnd`, just operating on shared state.

`ChecklistSection`'s toggle/delete handlers keep their direct API calls (no
behavior change there), but their updated task (or the task fetched
afterward) should be passed through `TasksContext`'s update path so
checklist-count changes are reflected on Board/Grid immediately — this
already happens naturally, since `recomputeProgress`
(`internal/tasks/service.go:220`) publishes a fresh `task.updated` for the
containing task whenever checklist state changes.

### Event reconciliation

A pure function, easy to reason about and to unit-test in isolation:

```ts
function applyPlannerEvent(
  state: { tasks: Task[]; buckets: Bucket[] },
  event: PlanEvent
): { tasks: Task[]; buckets: Bucket[]; needsRefetch?: boolean }
```

Behavior per event type (the Hub already filters by `planId` server-side, so
every event received while connected belongs to the active plan — no
client-side planId check needed):

| Event | Behavior |
|---|---|
| `task.created` | Upsert by `id` into `tasks` (append if absent, replace if present — makes the mutation's own echo a no-op) |
| `task.updated` | Replace by `id` **only if** `event.payload.updatedAt >= local.updatedAt`; insert if not currently present locally |
| `task.deleted` | Remove by `payload.taskId` |
| `bucket.created` | Upsert by `id` (full payload always available) |
| `bucket.updated` | If payload is `null`/missing required fields (`id` at minimum), set `needsRefetch: true` instead of guessing; otherwise patch the known fields (e.g. `id`/`name`) in place |
| `bucket.deleted` | Remove by `payload.id` |
| anything else (`task.moved`, `comment.added`, `checklist.*`, `label.created`, `member.*` — defined but never published today) | No-op; `console.debug` only, so future backend additions don't crash the frontend |

When `needsRefetch` comes back, the provider calls `refetch()` and discards
the partial event rather than rendering a guessed state.

### Reconnect handling

The provider tracks the previous `connected` value; on a `false → true`
transition it calls `refetch()` once, to pick up anything published while
disconnected. This is the same "authoritative refetch heals gaps" mechanism
used for incomplete bucket payloads above — one code path, two triggers.

### Components touched

| File | Change |
|---|---|
| `contexts/TasksContext.tsx` | **New.** State, fetch, mutation wrappers, `applyPlannerEvent`, reconnect handling |
| `BoardView.tsx`, `GridView.tsx`, `ScheduleView.tsx`, `TimelineView.tsx` | Remove local task/bucket fetch state; consume `useTasks()` instead |
| `TaskDetailPanel.tsx` | `handleUpdate` calls `useTasks().updateTask(...)` instead of only setting local state — fixes the board-doesn't-see-panel-edits bug as a side effect |
| `AddTaskInline.tsx` | Calls `useTasks().createTask(...)` directly instead of relying on an `onTaskAdded` prop — fixes the missing-prop bug by removing the need for it |
| `BucketColumn.tsx`, `TaskCard.tsx`, `FilterBar.tsx` | Unchanged — remain pure prop consumers |
| Backend `internal/tasks/handler.go` (`ReorderTasks`) | **Required addition:** publish `task.updated` (or `task.moved`, already reserved in `events.go` but never used) for each task whose bucket/position changed |
| Backend `internal/boards/service.go` (`MoveBucket`) | **Required addition:** publish `bucket.updated` with a real payload (`id`, `name`, `position`) instead of `nil` |

The two backend changes are required, not optional: without them,
`needsRefetch` fires on every bucket move and reorder events never arrive at
all, so drag-and-drop stays invisible across clients regardless of the
frontend work.

## Race conditions / error handling

Idempotent upsert-by-id plus the `updatedAt` comparison above makes the
common case — a client receiving the broadcast echo of its own mutation —
harmless: reapplying identical data is a no-op. The same comparison protects
against a genuinely late/out-of-order remote event overwriting a newer local
state.

Buckets don't carry `updatedAt` on every event type today (`bucket.updated`
for a rename is `{id, name}`, delete is `{id}`, move was `nil`), so the same
timestamp comparison isn't available uniformly. Rather than special-case
partial merges, the reconciliation function's `needsRefetch` escape hatch
(above) is the deliberate fallback for any bucket payload that doesn't carry
enough information to patch safely.

## Testing

No test framework exists in `plannercore/web` today (checked
`package.json` — no Vitest/Jest/RTL). Verification for this feature is
manual: open the same plan in two browser tabs/windows and confirm
create/update/delete/reorder/assignee changes propagate live, plus a
regression check that the two existing bugs (panel edits, inline-added
tasks) are now fixed without a manual refresh. A standalone unit test for
the pure `applyPlannerEvent` function (e.g. via Node's built-in `node --test`,
no new dependency required) is possible but not included by default — only
add it if requested.

## Out of scope

- `MyTasksPage` / `MyDayPage` (cross-plan aggregate views) — the WebSocket
  transport is plan-scoped, so covering these would need a different
  mechanism, not just a frontend consumer change.
- `ChartsView`, `PeopleView`, `GoalsView` — read from aggregate analytics
  endpoints, not the raw task list; live-updating them would mean
  recomputing aggregates client-side, a separate and larger piece of work.
- Toast/notification hints for remote changes (e.g. "X moved task Y") — the
  toast infrastructure (`utils/toast.ts`) already exists and is currently
  unused anywhere in the codebase, but wiring it into this feature is a
  separate nice-to-have, not required for sync correctness.
- Assignee display (Outlook-style suggestion picker, display name instead of
  raw user ID) — separate, smaller spec, tracked independently.
- Microsoft-tenant user sync / hybrid user model — separate, larger spec,
  tracked independently; not related to this feature beyond sharing the
  same codebase.
- Introducing a frontend test framework — not part of this change.
