# WebSocket Live-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend actually consume the WebSocket `lastEvent` that already arrives today, via one shared `TasksContext` that every task-displaying view reads from, so create/update/delete/reorder changes show up live across clients and across same-tab views without a manual refresh.

**Architecture:** A new `TasksProvider` becomes the single source of truth for the active plan's tasks and buckets. It fetches once, exposes mutation wrappers that call the existing REST API and then reconcile the result through a pure `applyPlannerEvent` function, and reconciles incoming WebSocket events through the exact same function. Six view components stop fetching their own copy of the data and read from this context instead. Two backend gaps (`ReorderTasks`, `MoveBucket` not publishing usable events) are fixed so drag-and-drop is actually live-synced too.

**Tech Stack:** React 18 + TypeScript (frontend, `plannercore/web`), Go 1.25 + Gin + GORM (backend, `plannercore`). No test framework exists in the frontend (`web/package.json` has no Vitest/Jest/RTL) or backend (no `*_test.go` files, no sqlite/testify dependency) — verification is manual except for the one pure function below, which is tested with Node's built-in test runner (Node v24 here, no new dependency).

## Global Constraints

- No new npm or Go dependencies. The frontend has no test framework and none is added by this plan. The backend has no test framework and none is added by this plan.
- Match existing code style exactly: domain objects are typed `any` throughout this codebase (no `Task`/`Bucket` TypeScript interfaces exist anywhere — confirmed via repo-wide search) — do not introduce one now.
- Every mutation wrapper in `TasksContext` must reuse the exact same REST endpoints already defined in `web/src/services/plannerApi.ts` — no new endpoints, no changes to `plannerApi.ts`.
- Inline CSS-in-JS `style={{ ... }}` with `var(--...)` custom properties is this codebase's only styling approach — not touched by this plan (no new UI in this feature).

---

## Task 1: Pure event-reconciliation function + test

**Files:**
- Create: `web/src/lib/plannerEvents.ts`
- Create: `web/src/lib/plannerEvents.test.ts`

**Interfaces:**
- Produces: `applyPlannerEvent(state: { tasks: any[]; buckets: any[] }, event: PlanEvent): { tasks: any[]; buckets: any[]; needsRefetch?: boolean }` and `export type PlanEvent = { type: string; planId: string; payload: unknown; userId?: string; timestamp?: string }`. Task 2 imports both.

- [ ] **Step 1: Write `plannerEvents.ts`**

```ts
export type PlanEvent = {
  type: string;
  planId: string;
  payload: unknown;
  userId?: string;
  timestamp?: string;
};

interface ReconcileState {
  tasks: any[];
  buckets: any[];
}

interface ReconcileResult extends ReconcileState {
  needsRefetch?: boolean;
}

function upsertById(list: any[], item: any): any[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const copy = list.slice();
  copy[idx] = item;
  return copy;
}

function patchById(list: any[], id: string, patch: Record<string, unknown>): any[] {
  return list.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

// applyPlannerEvent is the single place that turns a PlanEvent (whether it
// arrived over the WebSocket or was synthesized locally right after a
// mutation's own API call resolved) into the next { tasks, buckets } state.
// Reusing it for both means a client's own change and the server's later
// broadcast echo of that same change are reconciled identically — the echo
// is just a harmless no-op re-application of data already applied.
export function applyPlannerEvent(state: ReconcileState, event: PlanEvent): ReconcileResult {
  const payload = event.payload as any;

  switch (event.type) {
    case 'task.created': {
      if (!payload || typeof payload.id !== 'string') return state;
      return { ...state, tasks: upsertById(state.tasks, payload) };
    }
    case 'task.updated': {
      if (!payload || typeof payload.id !== 'string') return state;
      const existing = state.tasks.find((t) => t.id === payload.id);
      if (existing?.updatedAt && payload.updatedAt) {
        const incoming = new Date(payload.updatedAt).getTime();
        const current = new Date(existing.updatedAt).getTime();
        if (incoming < current) return state; // stale/out-of-order event, ignore
      }
      return { ...state, tasks: upsertById(state.tasks, payload) };
    }
    case 'task.deleted': {
      if (!payload || typeof payload.taskId !== 'string') return state;
      return { ...state, tasks: state.tasks.filter((t) => t.id !== payload.taskId) };
    }
    case 'bucket.created': {
      if (!payload || typeof payload.id !== 'string') return state;
      return { ...state, buckets: upsertById(state.buckets, payload) };
    }
    case 'bucket.updated': {
      if (!payload || typeof payload.id !== 'string') {
        return { ...state, needsRefetch: true };
      }
      if (!state.buckets.some((b) => b.id === payload.id)) {
        return { ...state, needsRefetch: true };
      }
      const { id, ...patch } = payload;
      return { ...state, buckets: patchById(state.buckets, id, patch) };
    }
    case 'bucket.deleted': {
      if (!payload || typeof payload.id !== 'string') return state;
      return { ...state, buckets: state.buckets.filter((b) => b.id !== payload.id) };
    }
    default:
      // task.moved, comment.added, checklist.toggled/added, label.created,
      // member.added/removed are reserved in the backend's EventType enum
      // but never published today. Ignoring anything not handled above
      // means the frontend won't crash the day one of them starts being
      // published — it'll just keep not-reacting to it until this switch
      // is extended.
      return state;
  }
}
```

- [ ] **Step 2: Write `plannerEvents.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPlannerEvent } from './plannerEvents.ts';

test('task.created appends a new task', () => {
  const state = { tasks: [], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'task.created',
    planId: 'p1',
    payload: { id: 't1', title: 'New task', updatedAt: '2026-01-01T00:00:00Z' },
  });
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].id, 't1');
});

test('task.updated replaces an existing task by id', () => {
  const state = {
    tasks: [{ id: 't1', title: 'Old title', updatedAt: '2026-01-01T00:00:00Z' }],
    buckets: [],
  };
  const result = applyPlannerEvent(state, {
    type: 'task.updated',
    planId: 'p1',
    payload: { id: 't1', title: 'New title', updatedAt: '2026-01-01T00:01:00Z' },
  });
  assert.equal(result.tasks[0].title, 'New title');
});

test('task.updated ignores a stale/out-of-order event', () => {
  const state = {
    tasks: [{ id: 't1', title: 'Current title', updatedAt: '2026-01-01T00:05:00Z' }],
    buckets: [],
  };
  const result = applyPlannerEvent(state, {
    type: 'task.updated',
    planId: 'p1',
    payload: { id: 't1', title: 'Stale title', updatedAt: '2026-01-01T00:01:00Z' },
  });
  assert.equal(result.tasks[0].title, 'Current title');
});

test('task.updated inserts the task if not already present locally', () => {
  const state = { tasks: [], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'task.updated',
    planId: 'p1',
    payload: { id: 't1', title: 'From another client', updatedAt: '2026-01-01T00:00:00Z' },
  });
  assert.equal(result.tasks.length, 1);
});

test('task.deleted removes the task by id', () => {
  const state = { tasks: [{ id: 't1' }, { id: 't2' }], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'task.deleted',
    planId: 'p1',
    payload: { taskId: 't1' },
  });
  assert.deepEqual(result.tasks.map((t) => t.id), ['t2']);
});

test('bucket.updated patches only the known fields, leaving others untouched', () => {
  const state = { tasks: [], buckets: [{ id: 'b1', name: 'Todo', position: 0 }] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.updated',
    planId: 'p1',
    payload: { id: 'b1', position: 1 },
  });
  assert.equal(result.buckets[0].position, 1);
  assert.equal(result.buckets[0].name, 'Todo');
});

test('bucket.updated with no payload requests a refetch instead of guessing', () => {
  const state = { tasks: [], buckets: [{ id: 'b1', name: 'Todo', position: 0 }] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.updated',
    planId: 'p1',
    payload: null,
  });
  assert.equal(result.needsRefetch, true);
  assert.equal(result.buckets[0].position, 0); // unchanged
});

test('bucket.updated for an unknown bucket id requests a refetch', () => {
  const state = { tasks: [], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.updated',
    planId: 'p1',
    payload: { id: 'unknown-bucket', position: 1 },
  });
  assert.equal(result.needsRefetch, true);
});

test('bucket.deleted removes the bucket by id', () => {
  const state = { tasks: [], buckets: [{ id: 'b1' }, { id: 'b2' }] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.deleted',
    planId: 'p1',
    payload: { id: 'b1' },
  });
  assert.deepEqual(result.buckets.map((b) => b.id), ['b2']);
});

test('unknown event types are a no-op', () => {
  const state = { tasks: [{ id: 't1' }], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'comment.added',
    planId: 'p1',
    payload: { id: 'c1' },
  });
  assert.deepEqual(result, state);
});
```

- [ ] **Step 3: Run the test and verify it passes**

Run: `cd /opt/dev/cores/plannercore/web && node --test src/lib/plannerEvents.test.ts`
Expected: `# pass 10`, `# fail 0` (Node v22.6+/23+/24 strips TypeScript types natively — no ts-node, no build step needed).

- [ ] **Step 4: Commit**

```bash
cd /opt/dev/cores/plannercore
git add web/src/lib/plannerEvents.ts web/src/lib/plannerEvents.test.ts
git commit -m "feat: add pure planner-event reconciliation function"
```

---

## Task 2: `TasksContext` provider

**Files:**
- Create: `web/src/contexts/TasksContext.tsx`

**Interfaces:**
- Consumes: `applyPlannerEvent`, `PlanEvent` from `../lib/plannerEvents` (Task 1); `usePlanContext` from `./PlanContext` (existing, returns `{ activePlanId: string | null, ... }`); `useWebSocket` from `./WebSocketContext` (existing, returns `{ lastEvent: unknown | null, connected: boolean }`); `api` from `../services/plannerApi` (existing).
- Produces: `TasksProvider` component and `usePlanTasks()` hook returning:
  `{ tasks: any[], buckets: any[], loading: boolean, refetch(): void, createTask(title, bucketId?): Promise<any>, updateTask(taskId, updates): Promise<any>, deleteTask(taskId): Promise<void>, reorderTask(items): Promise<void>, addAssignee(taskId, user): Promise<void>, removeAssignee(taskId, userId): Promise<void>, createBucket(name): Promise<any>, updateBucket(bucketId, name): Promise<void>, deleteBucket(bucketId): Promise<void>, moveBucket(bucketId, direction): Promise<void> }`.
  Tasks 4-7 call these exact names.

- [ ] **Step 1: Write `TasksContext.tsx`**

```tsx
import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePlanContext } from './PlanContext';
import { useWebSocket } from './WebSocketContext';
import { api } from '../services/plannerApi';
import { applyPlannerEvent, type PlanEvent } from '../lib/plannerEvents';

interface TasksContextValue {
  tasks: any[];
  buckets: any[];
  loading: boolean;
  refetch: () => void;
  createTask: (title: string, bucketId?: string) => Promise<any>;
  updateTask: (taskId: string, updates: any) => Promise<any>;
  deleteTask: (taskId: string) => Promise<void>;
  reorderTask: (items: { id: string; bucketId: string; position: number }[]) => Promise<void>;
  addAssignee: (taskId: string, user: { userId: string; username: string }) => Promise<void>;
  removeAssignee: (taskId: string, userId: string) => Promise<void>;
  createBucket: (name: string) => Promise<any>;
  updateBucket: (bucketId: string, name: string) => Promise<void>;
  deleteBucket: (bucketId: string) => Promise<void>;
  moveBucket: (bucketId: string, direction: 'left' | 'right') => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const { activePlanId } = usePlanContext();
  const { lastEvent, connected } = useWebSocket();
  const [state, setState] = useState<{ tasks: any[]; buckets: any[] }>({ tasks: [], buckets: [] });
  const [loading, setLoading] = useState(false);
  const wasConnected = useRef(connected);

  const refetch = useCallback(() => {
    if (!activePlanId || activePlanId === 'new') {
      setState({ tasks: [], buckets: [] });
      return;
    }
    setLoading(true);
    Promise.all([api.tasks.list(activePlanId), api.buckets.list(activePlanId)])
      .then(([tasks, buckets]) => setState({ tasks, buckets }))
      .catch(() => setState({ tasks: [], buckets: [] }))
      .finally(() => setLoading(false));
  }, [activePlanId]);

  // Initial fetch, and whenever the active plan changes.
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Reconcile every incoming WebSocket event through the same pure function
  // used for local mutations below.
  useEffect(() => {
    if (!lastEvent) return;
    setState((prev) => {
      const result = applyPlannerEvent(prev, lastEvent as PlanEvent);
      if (result.needsRefetch) {
        refetch();
        return prev;
      }
      return result;
    });
  }, [lastEvent, refetch]);

  // A reconnect (false -> true) may have missed events while disconnected;
  // heal that with one authoritative refetch, same escape hatch as above.
  useEffect(() => {
    if (connected && !wasConnected.current) {
      refetch();
    }
    wasConnected.current = connected;
  }, [connected, refetch]);

  const applyLocalEvent = useCallback((event: PlanEvent) => {
    setState((prev) => {
      const result = applyPlannerEvent(prev, event);
      return result.needsRefetch ? prev : result;
    });
  }, []);

  const createTask = useCallback(
    async (title: string, bucketId?: string) => {
      if (!activePlanId) throw new Error('no active plan');
      const task = await api.tasks.create(activePlanId, title, bucketId);
      applyLocalEvent({ type: 'task.created', planId: activePlanId, payload: task });
      return task;
    },
    [activePlanId, applyLocalEvent],
  );

  const updateTask = useCallback(
    async (taskId: string, updates: any) => {
      const task = await api.tasks.update(taskId, updates);
      applyLocalEvent({ type: 'task.updated', planId: activePlanId || '', payload: task });
      return task;
    },
    [activePlanId, applyLocalEvent],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      await api.tasks.delete(taskId);
      applyLocalEvent({ type: 'task.deleted', planId: activePlanId || '', payload: { taskId } });
    },
    [activePlanId, applyLocalEvent],
  );

  // Mirrors BoardView's existing drag-and-drop behavior exactly: patch
  // bucketId/position onto matching tasks immediately, call the API, and
  // revert via a full refetch if the API call fails.
  const reorderTask = useCallback(
    async (items: { id: string; bucketId: string; position: number }[]) => {
      if (!activePlanId) throw new Error('no active plan');
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => {
          const match = items.find((i) => i.id === t.id);
          return match ? { ...t, bucketId: match.bucketId, position: match.position } : t;
        }),
      }));
      try {
        await api.tasks.reorder(activePlanId, items);
      } catch (e) {
        refetch();
        throw e;
      }
    },
    [activePlanId, refetch],
  );

  const addAssignee = useCallback(async (taskId: string, user: { userId: string; username: string }) => {
    await api.tasks.addAssignee(taskId, user.userId);
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, assignees: [...(t.assignees || []), user] } : t,
      ),
    }));
  }, []);

  const removeAssignee = useCallback(async (taskId: string, userId: string) => {
    await api.tasks.removeAssignee(taskId, userId);
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId
          ? { ...t, assignees: (t.assignees || []).filter((a: any) => a.userId !== userId) }
          : t,
      ),
    }));
  }, []);

  const createBucket = useCallback(
    async (name: string) => {
      if (!activePlanId) throw new Error('no active plan');
      const bucket = await api.buckets.create(activePlanId, name);
      applyLocalEvent({ type: 'bucket.created', planId: activePlanId, payload: bucket });
      return bucket;
    },
    [activePlanId, applyLocalEvent],
  );

  const updateBucket = useCallback(
    async (bucketId: string, name: string) => {
      if (!activePlanId) throw new Error('no active plan');
      await api.buckets.update(activePlanId, bucketId, name);
      applyLocalEvent({ type: 'bucket.updated', planId: activePlanId, payload: { id: bucketId, name } });
    },
    [activePlanId, applyLocalEvent],
  );

  // Deleting a bucket un-assigns its tasks server-side; a full refetch (not
  // a local patch) is required to see which tasks changed, exactly like the
  // pre-existing BoardView.onBucketDeleted -> refetchTasks() behavior.
  const deleteBucket = useCallback(
    async (bucketId: string) => {
      if (!activePlanId) throw new Error('no active plan');
      await api.buckets.delete(activePlanId, bucketId);
      refetch();
    },
    [activePlanId, refetch],
  );

  const moveBucket = useCallback(
    async (bucketId: string, direction: 'left' | 'right') => {
      if (!activePlanId) throw new Error('no active plan');
      await api.buckets.move(activePlanId, bucketId, direction);
      refetch();
    },
    [activePlanId, refetch],
  );

  return (
    <TasksContext.Provider
      value={{
        tasks: state.tasks,
        buckets: state.buckets,
        loading,
        refetch,
        createTask,
        updateTask,
        deleteTask,
        reorderTask,
        addAssignee,
        removeAssignee,
        createBucket,
        updateBucket,
        deleteBucket,
        moveBucket,
      }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function usePlanTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('usePlanTasks must be used within a TasksProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd /opt/dev/cores/plannercore/web && npx tsc -b --noEmit`
Expected: no errors mentioning `TasksContext.tsx` (unused-export errors for `TasksProvider`/`usePlanTasks` are expected and fine at this point — nothing imports them until Task 3).

- [ ] **Step 3: Commit**

```bash
git add web/src/contexts/TasksContext.tsx
git commit -m "feat: add TasksContext as shared task/bucket store"
```

---

## Task 3: Wire `TasksProvider` into `App.tsx`

**Files:**
- Modify: `web/src/App.tsx:1-83`

**Interfaces:**
- Consumes: `TasksProvider` from `./contexts/TasksContext` (Task 2).

- [ ] **Step 1: Add the import**

In `web/src/App.tsx`, after line 4 (`import { WebSocketProvider } from './contexts/WebSocketContext'`), add:

```tsx
import { TasksProvider } from './contexts/TasksContext'
```

- [ ] **Step 2: Wrap the routes**

Replace (lines 70-78):

```tsx
          <WebSocketProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/plan/:planId/*" element={<AuthGate><PlanLayout /></AuthGate>} />
              <Route path="/my/tasks" element={<AuthGate><AppLayout><MyTasksPage /></AppLayout></AuthGate>} />
              <Route path="/my/day" element={<AuthGate><AppLayout><MyDayPage /></AppLayout></AuthGate>} />
              <Route path="*" element={<Navigate to="/plan/new" />} />
            </Routes>
          </WebSocketProvider>
```

with:

```tsx
          <WebSocketProvider>
            <TasksProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/plan/:planId/*" element={<AuthGate><PlanLayout /></AuthGate>} />
                <Route path="/my/tasks" element={<AuthGate><AppLayout><MyTasksPage /></AppLayout></AuthGate>} />
                <Route path="/my/day" element={<AuthGate><AppLayout><MyDayPage /></AppLayout></AuthGate>} />
                <Route path="*" element={<Navigate to="/plan/new" />} />
              </Routes>
            </TasksProvider>
          </WebSocketProvider>
```

`TasksProvider` guards on `activePlanId` internally (same as `WebSocketProvider` already does), so wrapping `/my/tasks`, `/my/day`, and `/login` too is harmless — they simply don't consume it (see "Out of scope" in the design spec).

- [ ] **Step 3: Verify the app still builds**

Run: `cd /opt/dev/cores/plannercore/web && npm run build`
Expected: build succeeds (no TypeScript errors).

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat: mount TasksProvider for the active plan"
```

---

## Task 4: Migrate `BoardView` to `TasksContext`

**Files:**
- Modify: `web/src/components/board/BoardView.tsx` (full file, 289 lines)

**Interfaces:**
- Consumes: `usePlanTasks()` from `../../contexts/TasksContext` (Task 2): `tasks`, `buckets`, `reorderTask(items)`.

- [ ] **Step 1: Replace the data-fetching section**

Replace lines 1-44 (imports through the buckets/labels `useEffect`):

```tsx
import { useState, useEffect, useMemo, useCallback, ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { Kanban, type LucideIcon } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { api } from '../../services/plannerApi';
import { usePlanTasks } from '../../contexts/TasksContext';
import BucketColumn from './BucketColumn';
import AddBucketInline from './AddBucketInline';
import EmptyState from '../shared/EmptyState';
import FilterBar from '../shared/FilterBar';
import TaskDetailPanel from '../tasks/TaskDetailPanel';
import { EMPTY_FILTERS, assigneeOptionsFromTasks, filterTasks, type TaskFilters } from '../../lib/taskFilters';
import type { TaskCardData } from './types';

export default function BoardView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks, buckets, reorderTask } = usePlanTasks();
  const [labels, setLabels] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);

  // Labels aren't part of live-sync (no label.* events exist yet) — kept as
  // BoardView's own fetch, same as before.
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.labels.list(planId).then(setLabels).catch(() => setLabels([]));
    } else {
      setLabels([]);
    }
  }, [planId]);
```

`buckets` and `setBuckets`/the old `useTasks` hook are gone — both now come from context (`tasks`/`buckets`/`reorderTask`). Everything else in this block (imports, `labels` state, the labels fetch) is unchanged from the original — only `useMemo`/`useCallback`/`ComponentType` remain used further down in the file for `filteredTasks`/`assigneeOptions`/`tasksByBucket`/`sensors`/`refetchTasks`(removed next step)/`handleDragEnd`, so the import line keeps all of them.

(So the final import line is `import { useState, useEffect, useMemo, useCallback, ComponentType } from 'react';` — same as the original, just without needing anything else new.)

- [ ] **Step 2: Simplify `refetchTasks`, `handleDragEnd`, and the panel callbacks**

Replace lines 81-88 (`refetchTasks`) — delete it entirely, it's no longer needed (`reorderTask` handles its own revert-on-failure internally, and nothing else in this file calls `refetchTasks` after this task).

Replace lines 90-189 (`handleDragEnd`) with:

```tsx
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !planId) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      const activeTask = tasks.find((t: any) => t.id === activeId);
      if (!activeTask) return;

      let newBucketId: string | undefined;
      let overTaskId: string | undefined;

      const isOverBucket = buckets.some((b) => b.id === overId);

      if (isOverBucket) {
        newBucketId = overId;
      } else {
        overTaskId = overId;
        const overTask = tasks.find((t: any) => t.id === overId);
        if (!overTask) return;
        newBucketId = overTask.bucketId || undefined;
      }

      const srcBucketId = activeTask.bucketId || '__unassigned__';
      const destBucketId = newBucketId || '__unassigned__';

      const grouped: Record<string, any[]> = {};
      tasks.forEach((t: any) => {
        const bid = t.bucketId || '__unassigned__';
        if (!grouped[bid]) grouped[bid] = [];
        grouped[bid].push({ ...t });
      });

      grouped[srcBucketId] = (grouped[srcBucketId] || []).filter((t: any) => t.id !== activeId);
      if (!grouped[destBucketId]) grouped[destBucketId] = [];

      const updatedTask = { ...activeTask, bucketId: newBucketId || '' };

      if (overTaskId) {
        const overIdx = grouped[destBucketId].findIndex((t: any) => t.id === overTaskId);
        if (overIdx >= 0) {
          grouped[destBucketId].splice(overIdx, 0, updatedTask);
        } else {
          grouped[destBucketId].push(updatedTask);
        }
      } else {
        grouped[destBucketId].push(updatedTask);
      }

      const allTasks: any[] = [];
      Object.entries(grouped).forEach(([bid, arr]) => {
        arr.forEach((t: any, i: number) => {
          allTasks.push({
            id: t.id,
            bucketId: bid === '__unassigned__' ? '' : bid,
            position: i,
          });
        });
      });

      reorderTask(allTasks).catch(() => {});
    },
    [planId, tasks, buckets, reorderTask],
  );
```

(Same reordering math as before; the only change is the last step now builds the minimal `{id, bucketId, position}` items directly — since that's all `reorderTask` needs — and calls it once instead of `setTasks` + `api.tasks.reorder`.)

Replace lines 275-286 (the `TaskDetailPanel` render) with:

```tsx
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          planId={planId}
          onTaskDeleted={() => setSelectedTaskId(null)}
        />
      )}
```

`onTaskUpdated` is dropped here — Task 7 makes `TaskDetailPanel` call `usePlanTasks().updateTask(...)` directly, which already updates the shared `tasks` array everyone reads, so no callback is needed. `onTaskDeleted` no longer performs the delete itself — that would double-delete once Task 7 lands, since Task 7 makes `TaskDetailPanel`'s own delete-confirm handler call the shared `deleteTask` (which already removes the task from the context every view reads). Its only remaining job here is closing the now-stale panel.

- [ ] **Step 3: Drop the now-broken bucket-mutation callback props**

`buckets` no longer comes from a local `useState` (Step 1 removed it), so the `setBuckets`-calling callbacks below no longer have anything to call. Replace the `BucketColumn`/`AddBucketInline` render block (originally lines 248-272):

```tsx
          {columns.map((col, idx) => (
            <BucketColumn
              key={col.bucket.id}
              bucket={col.bucket}
              tasks={col.tasks}
              planId={planId}
              isFirst={idx === 0}
              isLast={idx === columns.length - 1}
              onTaskClick={(taskId) => setSelectedTaskId(taskId)}
            />
          ))}
          <AddBucketInline planId={planId} />
```

`BucketColumn` and `AddBucketInline` still *declare* `onBucketRenamed`/`onBucketDeleted`/`onBucketMoved`/`onBucketAdded` as optional props at this point (Task 5 removes them from the interfaces and fixes their internals to call `TasksContext` directly) — simply not passing them here is enough for this task to compile and be reviewed independently. Between this task and Task 5 landing, renaming/moving/deleting a bucket or adding one via the inline "+" will still hit the API correctly (`BucketColumn`/`AddBucketInline`'s own implementation is unchanged until Task 5) but won't visibly update until Task 5's fix — an acceptable transitional state within the same feature branch, not a regression in anything currently shipped.

- [ ] **Step 4: Verify the build**

Run: `cd /opt/dev/cores/plannercore/web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/board/BoardView.tsx
git commit -m "feat: read BoardView tasks/buckets from TasksContext"
```

---

## Task 5: Move bucket/task creation and mutation call-sites onto `TasksContext`

**Files:**
- Modify: `web/src/components/board/AddTaskInline.tsx` (full file, 107 lines)
- Modify: `web/src/components/board/AddBucketInline.tsx` (full file, 133 lines)
- Modify: `web/src/components/board/BucketColumn.tsx:1-124` (imports, props, rename/move/delete handlers)

`BoardView.tsx` is not touched by this task — Task 4 already stopped passing the callback props this task makes obsolete.

**Why this task exists:** `BucketColumn` currently calls `api.buckets.update/move/delete` itself and only uses `onBucketRenamed`/`onBucketDeleted`/`onBucketMoved` to tell `BoardView` to patch its own separate copy of `buckets`. Now that `buckets` lives in `TasksContext`, having `BucketColumn` call the API *and* having `BoardView`'s callback call a context mutation (which would call the API *again*) would double-fire every rename/move/delete. The fix is for `BucketColumn` (and `AddTaskInline`/`AddBucketInline`) to call `usePlanTasks()` mutations directly, which removes the need for the callback props entirely.

**Interfaces:**
- Consumes: `usePlanTasks()` — `createTask`, `createBucket`, `updateBucket`, `deleteBucket`, `moveBucket`.

- [ ] **Step 1: `AddTaskInline.tsx`** — replace the whole file's logic (JSX unchanged, only the top and `handleAdd` change):

Replace lines 1-33:

```tsx
import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { usePlanTasks } from '../../contexts/TasksContext';

interface AddTaskInlineProps {
  planId: string;
  bucketId?: string;
}

export default function AddTaskInline({ bucketId }: AddTaskInlineProps) {
  const { createTask } = usePlanTasks();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await createTask(trimmed, bucketId);
      setTitle('');
      setExpanded(false);
    } catch (e) {
      /* silently fail */
    }
  };
```

`planId` stays an accepted prop (harmless if unused by callers that still pass it — see Step 4) but is no longer read inside the component; TypeScript's `noUnusedParameters` would flag an unused *destructured* variable, not an unused interface field, so leaving it in `AddTaskInlineProps` is safe. The rest of the file (from `handleKeyDown` down to the closing `}`) is unchanged.

- [ ] **Step 2: `AddBucketInline.tsx`** — replace lines 1-34:

```tsx
import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { usePlanTasks } from '../../contexts/TasksContext';

interface AddBucketInlineProps {
  planId: string;
}

export default function AddBucketInline({}: AddBucketInlineProps) {
  const { createBucket } = usePlanTasks();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createBucket(trimmed);
      setName('');
      setError(null);
      setExpanded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spalte konnte nicht erstellt werden');
    }
  };
```

Rest of the file unchanged.

- [ ] **Step 3: `BucketColumn.tsx`** — replace lines 1-123 (imports through `handleDeleteConfirm`):

```tsx
import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MoreHorizontal, ArrowLeft, ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { STYLES } from '../../lib/constants';
import { usePlanTasks } from '../../contexts/TasksContext';
import TaskCard from './TaskCard';
import AddTaskInline from './AddTaskInline';
import type { TaskCardData } from './types';

interface BucketColumnProps {
  bucket: {
    id: string;
    name: string;
  };
  tasks: TaskCardData[];
  planId: string;
  isFirst?: boolean;
  isLast?: boolean;
  onTaskClick?: (taskId: string) => void;
}

const menuItemStyle: React.CSSProperties = {
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
};

export default function BucketColumn({
  bucket,
  tasks,
  planId,
  isFirst,
  isLast,
  onTaskClick,
}: BucketColumnProps) {
  const { updateBucket, deleteBucket, moveBucket } = usePlanTasks();
  const { setNodeRef, isOver } = useDroppable({ id: bucket.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(bucket.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  const handleRenameSave = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === bucket.name) {
      setNameValue(bucket.name);
      setRenaming(false);
      setRenameError(null);
      return;
    }
    try {
      await updateBucket(bucket.id, trimmed);
      setRenameError(null);
      setRenaming(false);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Umbenennen fehlgeschlagen');
    }
  };

  const handleMove = async (direction: 'left' | 'right') => {
    setMenuOpen(false);
    try {
      await moveBucket(bucket.id, direction);
      setMoveError(null);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : 'Verschieben fehlgeschlagen');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteBucket(bucket.id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };
```

`planId` stays in the props interface (still passed through to `AddTaskInline` at the bottom of the file, line 382 in the original — unchanged) even though `BucketColumn` itself no longer uses it directly for API calls. The rest of the file (JSX from the `return (` at the original line 125 onward) is unchanged, including the `<AddTaskInline planId={planId} bucketId={bucket.id} />` line.

Note: `BoardView.tsx`'s render block already passes only `bucket`/`tasks`/`planId`/`isFirst`/`isLast`/`onTaskClick` to `BucketColumn`, and only `planId` to `AddBucketInline` — Task 4, Step 2 already dropped the callback props this task's changes make obsolete, so there is nothing left to change in `BoardView.tsx` here.

- [ ] **Step 4: Verify the build**

Run: `cd /opt/dev/cores/plannercore/web && npm run build`
Expected: build succeeds. If TypeScript complains about an unused `bucket` destructure from `{}: AddBucketInlineProps` in Step 2, change it to `export default function AddBucketInline(_props: AddBucketInlineProps) {` instead — either form is fine, pick whichever the compiler accepts.

- [ ] **Step 5: Manual verification**

Run the dev server (`cd web && npm run dev`), open a plan's board:
1. Click "+ Spalte hinzufügen", type a name, confirm — new column appears without a page refresh.
2. Click "+ Aufgabe hinzufügen" inside a column, type a title, confirm — new card appears immediately in that column (this is the `AddTaskInline` bug fix — previously required an unrelated refetch to show up).
3. Rename a column via its "…" menu — new name shows immediately.
4. Move a column left/right via its "…" menu — order updates immediately.
5. Delete a column with tasks in it — column disappears and its tasks move to "Unassigned" without a manual refresh.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/board/AddTaskInline.tsx web/src/components/board/AddBucketInline.tsx web/src/components/board/BucketColumn.tsx
git commit -m "feat: wire bucket/task creation and bucket mutations through TasksContext"
```

---

## Task 6: Migrate `GridView`, `ScheduleView`, `TimelineView` to `TasksContext`

**Files:**
- Modify: `web/src/components/grid/GridView.tsx:1-53`
- Modify: `web/src/components/schedule/ScheduleView.tsx:1-36`
- Modify: `web/src/components/timeline/TimelineView.tsx:1-24`

**Interfaces:**
- Consumes: `usePlanTasks()` — `tasks`, `buckets` (GridView only).

- [ ] **Step 1: `GridView.tsx`** — replace lines 1-53:

```tsx
import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid } from 'lucide-react';
import { api } from '../../services/plannerApi';
import { usePlanTasks } from '../../contexts/TasksContext';
import { PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from '../../lib/constants';
import {
  EMPTY_FILTERS,
  assigneeOptionsFromTasks,
  filterTasks,
  type TaskFilters,
} from '../../lib/taskFilters';
import PriorityBadge from '../shared/PriorityBadge';
import LabelBadge from '../shared/LabelBadge';
import ProgressBar from '../shared/ProgressBar';
import Avatar from '../shared/Avatar';
import EmptyState from '../shared/EmptyState';
import FilterBar from '../shared/FilterBar';
import TaskDetailPanel from '../tasks/TaskDetailPanel';

type SortField = 'title' | 'priority' | 'dueDate' | 'progress' | 'bucket';
type SortDir = 'asc' | 'desc';
type GroupBy = 'none' | 'bucket' | 'assignee' | 'priority' | 'status' | 'label';
const COLUMN_COUNT = 8;

export default function GridView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks, buckets } = usePlanTasks();
  const [labels, setLabels] = useState<any[]>([]);
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Labels aren't part of live-sync yet — kept as GridView's own fetch.
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.labels.list(planId).then(setLabels).catch(() => setLabels([]));
    } else {
      setLabels([]);
    }
  }, [planId]);
```

The rest of the file (`bucketMap` and everything after) is unchanged, with one exception further down: the `TaskDetailPanel` render block (originally lines 456-467) currently reads

```tsx
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          planId={planId}
          onTaskDeleted={(taskId) => {
            setSelectedTaskId(null);
            setTasks((prev) => prev.filter((t: any) => t.id !== taskId));
          }}
          onTaskUpdated={() => refetchTasks()}
        />
      )}
    </>
  );
```

`setTasks` and `refetchTasks` no longer exist after this task (tasks come from context now), so replace it with:

```tsx
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          planId={planId}
          onTaskDeleted={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
```

Same reasoning as `BoardView` (Task 4, Step 1): `TaskDetailPanel`'s own `deleteTask`/`updateTask` calls (Task 7) already update the shared context every view reads, so no callback beyond closing the panel is needed. `ScheduleView.tsx` and `TimelineView.tsx`'s own `TaskDetailPanel` render blocks pass neither `onTaskDeleted` nor `onTaskUpdated` today (confirmed by reading both files) — nothing to change there in Steps 2-3 below.

- [ ] **Step 2: `ScheduleView.tsx`** — replace lines 1-36:

```tsx
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar as RBCalendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { usePlanTasks } from '../../contexts/TasksContext';
import EmptyState from '../shared/EmptyState';
import TaskDetailPanel from '../tasks/TaskDetailPanel';

const locales = { de };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

export default function ScheduleView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks } = usePlanTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
```

`useEffect`/`api` imports and the fetch effect (original lines 27-36) are removed entirely — `tasks` now comes from context. The rest of the file (`events` memo onward) is unchanged.

- [ ] **Step 3: `TimelineView.tsx`** — replace lines 1-24:

```tsx
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { GanttChart } from 'lucide-react';
import { usePlanTasks } from '../../contexts/TasksContext';
import { PRIORITY_COLORS } from '../../lib/constants';
import PriorityBadge from '../shared/PriorityBadge';
import EmptyState from '../shared/EmptyState';
import TaskDetailPanel from '../tasks/TaskDetailPanel';

export default function TimelineView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks } = usePlanTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
```

`useEffect`/`api` imports and the fetch effect (original lines 15-24) are removed — `tasks` now comes from context. Rest of the file unchanged.

- [ ] **Step 4: Verify the build**

Run: `cd /opt/dev/cores/plannercore/web && npm run build`
Expected: build succeeds. Fix any unused-import errors (e.g. if `useEffect` is no longer used anywhere else in a given file, remove it from that file's import line).

- [ ] **Step 5: Manual verification**

With the dev server running: open Grid view and Board view for the same plan in two browser tabs. Add a task from Board's inline "+", switch to the Grid tab without reloading — the new task appears. Repeat for Schedule/Timeline views with a task that has a due date/start date.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/grid/GridView.tsx web/src/components/schedule/ScheduleView.tsx web/src/components/timeline/TimelineView.tsx
git commit -m "feat: read GridView/ScheduleView/TimelineView tasks from TasksContext"
```

---

## Task 7: `TaskDetailPanel` propagates edits through `TasksContext`

**Files:**
- Modify: `web/src/components/tasks/TaskDetailPanel.tsx:110-179`

**Interfaces:**
- Consumes: `usePlanTasks()` — `updateTask(taskId, updates)`, `addAssignee(taskId, user)`, `removeAssignee(taskId, userId)`, `deleteTask(taskId)`.

**Why:** `handleUpdate`/`handleAddAssignee`/`handleRemoveAssignee` currently only set the panel's own local `task` state — the board behind the panel never learns about the change until an unrelated refetch happens. Routing them through the shared context fixes this, and also means the panel's own display updates from the same authoritative response it already used.

- [ ] **Step 1: Add the import and hook**

Add near the top of the file (after the `useAuth` import, around line 4):

```tsx
import { usePlanTasks } from '../../contexts/TasksContext';
```

Inside the component body, after the existing `useState` declarations (after line 37, before `const menuRef = ...`):

```tsx
  const { updateTask, addAssignee: addAssigneeToContext, removeAssignee: removeAssigneeFromContext, deleteTask } = usePlanTasks();
```

- [ ] **Step 2: Replace `handleUpdate`, `handleAddAssignee`, `handleRemoveAssignee`**

Replace lines 110-117:

```tsx
  const handleUpdate = async (updates: any) => {
    try {
      const updated = await updateTask(taskId!, updates);
      setTask((prev: any) => ({ ...prev, ...updated }));
    } catch (e) {
      /* silently fail */
    }
  };
```

Replace lines 149-167:

```tsx
  const handleAddAssignee = async (user: { userId: string; username: string }) => {
    const currentAssignees = task.assignees || [];
    if (currentAssignees.some((a: any) => a.userId === user.userId)) {
      setAssigneeInput('');
      setAssigneeSuggestions([]);
      return;
    }
    try {
      await addAssigneeToContext(taskId!, user);
      setTask((prev: any) => ({
        ...prev,
        assignees: [...currentAssignees, user],
      }));
      setAssigneeInput('');
      setAssigneeSuggestions([]);
    } catch (e) {
      /* silently fail */
    }
  };
```

Replace lines 169-179:

```tsx
  const handleRemoveAssignee = async (userId: string) => {
    try {
      await removeAssigneeFromContext(taskId!, userId);
      setTask((prev: any) => ({
        ...prev,
        assignees: (prev.assignees || []).filter((a: any) => a.userId !== userId),
      }));
    } catch (e) {
      /* silently fail */
    }
  };
```

`handleToggleLabel` (below line 179) is unchanged — labels are out of scope (no backend `label.*` events exist and `TasksContext` doesn't hold label state).

- [ ] **Step 3: Route the delete flow through the shared `deleteTask`**

Replace lines 190-200:

```tsx
  const handleDeleteConfirm = async () => {
    if (!taskId) return;
    try {
      await api.tasks.delete(taskId);
      setDeleteError(null);
      onTaskDeleted?.(taskId);
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };
```

with:

```tsx
  const handleDeleteConfirm = async () => {
    if (!taskId) return;
    try {
      await deleteTask(taskId);
      setDeleteError(null);
      onTaskDeleted?.(taskId);
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };
```

Only the delete call changes (`deleteTask` from context instead of `api.tasks.delete` directly) — `deleteTask` already calls that same API method and additionally removes the task from the shared state every view reads, which is what makes `BoardView`'s and `GridView`'s `onTaskDeleted={() => setSelectedTaskId(null)}` (Tasks 4 and 6) sufficient on their own: the task list update already happened here, before `onTaskDeleted` even fires.

- [ ] **Step 4: Verify the build**

Run: `cd /opt/dev/cores/plannercore/web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

Open the same plan's Board view in two browser tabs. In tab A, open a task and change its status, priority, and bucket via the detail panel — in tab B (without reloading), the card updates on the board within a second or two (WebSocket round trip). In tab A itself, closing and reopening the panel is no longer required to see the board reflect the change (this was the pre-existing same-tab bug).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/tasks/TaskDetailPanel.tsx
git commit -m "fix: propagate TaskDetailPanel edits through TasksContext"
```

---

## Task 8: Backend — `MoveBucket` publishes a usable payload

**Files:**
- Modify: `internal/boards/service.go:102-106`

**Interfaces:**
- Produces: two `core.EventBucketUpdated` events per move, each `Payload: map[string]interface{}{"id": string, "position": float64}` — consumed by `bucket.updated` in Task 1's `applyPlannerEvent`.

- [ ] **Step 1: Replace the event publish at the end of `MoveBucket`**

Replace lines 102-105:

```go
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventBucketUpdated,
		PlanID:  planID,
		Payload: map[string]interface{}{"id": buckets[idx].ID, "position": posB},
	})
	s.eventBus.Publish(planID, core.PlanEvent{
		Type:    core.EventBucketUpdated,
		PlanID:  planID,
		Payload: map[string]interface{}{"id": buckets[swapIdx].ID, "position": posA},
	})
```

(One event per swapped bucket, each carrying enough to patch in place — matches the `{id, name}` shape `UpdateBucket` already publishes for renames, just with `position` instead of `name`. `applyPlannerEvent`'s `bucket.updated` handler merges whichever fields are present, so this doesn't need a schema change on the frontend.)

- [ ] **Step 2: Verify the backend builds**

Run: `cd /opt/dev/cores/plannercore && go build ./...`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Start the backend locally against a dev database (or use the existing dev docker-compose stack). With two browser tabs open on the same plan's board (after Task 5 ships), use a column's "…" menu to move it left/right in tab A — tab B's column order updates without a refresh. Confirm via server logs or a quick `wscat`/browser DevTools WebSocket frame inspection that two `bucket.updated` messages are sent per move, each with a `position` field.

- [ ] **Step 4: Commit**

```bash
git add internal/boards/service.go
git commit -m "fix: MoveBucket publishes a usable bucket.updated payload"
```

---

## Task 9: Backend — `ReorderTasks` publishes `task.updated` events

**Files:**
- Modify: `internal/tasks/handler.go:279-285`

**Interfaces:**
- Produces: one `core.EventTaskUpdated` per reordered task, `Payload: *core.Task` (full, annotated) — consumed by the existing `task.updated` case in Task 1's `applyPlannerEvent`. Reuses `core.EventTaskUpdated` rather than the unused `core.EventTaskMoved` constant, since a reorder is exactly a bucket/position update and the frontend already has correct handling for `task.updated` — adding a second, identically-behaving case for `task.moved` would just be duplicate code.

- [ ] **Step 1: Publish an event per reordered task after the transaction commits**

Replace lines 279-284:

```go
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// One event per reordered task, mirroring how CreateTask/UpdateTask
	// already publish the full annotated task. A single drag can touch
	// every task in the plan (positions are renumbered per-bucket on every
	// move — see BoardView.handleDragEnd), so this is one query per moved
	// task; that's an existing cost of this endpoint's semantics, not a
	// regression this change introduces.
	for _, item := range items {
		task, err := h.service.GetTask(item.ID)
		if err != nil {
			continue
		}
		h.service.eventBus.Publish(planID, core.PlanEvent{
			Type:    core.EventTaskUpdated,
			PlanID:  planID,
			Payload: task,
		})
	}
	c.JSON(http.StatusOK, gin.H{"status": "reordered"})
```

(`Handler.service` and `Service.eventBus` are both in package `tasks`, so `h.service.eventBus.Publish` is a same-package field access — no new constructor parameter needed.)

- [ ] **Step 2: Verify the backend builds**

Run: `cd /opt/dev/cores/plannercore && go build ./...`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the dev stack running and two browser tabs open on the same board (after Task 5 ships), drag a card to a different column in tab A — tab B shows the card in its new column without a refresh, typically within a second.

- [ ] **Step 4: Commit**

```bash
git add internal/tasks/handler.go
git commit -m "fix: ReorderTasks publishes task.updated so drag-and-drop live-syncs"
```

---

## Task 10: Delete the now-dead `useTasks` hook

**Files:**
- Delete: `web/src/hooks/useTasks.ts`

**Why:** After Task 4, nothing calls it (`BoardView` was its only caller — confirmed via repo-wide search before this plan was written).

- [ ] **Step 1: Confirm there are no remaining callers**

Run: `cd /opt/dev/cores/plannercore/web && grep -rn "hooks/useTasks\|from '\\.\\./\\.\\./hooks/useTasks'" src`
Expected: no output.

- [ ] **Step 2: Delete the file**

```bash
git rm web/src/hooks/useTasks.ts
```

- [ ] **Step 3: Verify the build**

Run: `cd /opt/dev/cores/plannercore/web && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove useTasks hook, superseded by TasksContext"
```

---

## Task 11: End-to-end manual verification

No new files. This is the spec's full acceptance pass, run after all previous tasks are committed.

- [ ] **Step 1: Two-tab live-sync pass**

With the dev stack running, open the same plan in two browser tabs/windows side by side. In tab A, perform each of the following and confirm tab B reflects it within a couple of seconds, with no manual refresh in tab B:
1. Create a task via Board's inline "+".
2. Edit that task's title, status, priority, bucket, and due date via the detail panel.
3. Add and then remove an assignee via the detail panel.
4. Delete the task.
5. Create, rename, move, and delete a bucket.
6. Drag a task between two buckets.

- [ ] **Step 2: Same-tab consistency pass (the two pre-existing bugs)**

In a single tab: open a task's detail panel, change its bucket, close the panel — the board shows the task in its new column without a refresh. Add a task via a column's inline "+" — it appears in that column immediately.

- [ ] **Step 3: Reconnect-gap pass**

With the board open, disable network in DevTools (or stop the backend briefly) until the UI shows disconnected, make a change from a second tab or via `curl`, then restore the network/backend. Confirm the first tab picks up the missed change shortly after reconnecting (the `connected` false→true refetch).

- [ ] **Step 4: Regression pass on other views**

Repeat a create/update/delete cycle while Grid, Schedule, and Timeline views are open (one at a time) instead of Board, confirming each reflects live changes made from Board in another tab.

- [ ] **Step 5: Report results**

If every check in Steps 1-4 passes, the feature is complete. If any check fails, note exactly which one and its observed (vs. expected) behavior before treating this plan as done.
