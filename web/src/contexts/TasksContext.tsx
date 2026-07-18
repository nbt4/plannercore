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
  addAssignee: (
    taskId: string,
    user: { userId: string; displayName: string; username: string; email?: string; avatarUrl?: string },
  ) => Promise<void>;
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

  const addAssignee = useCallback(
    async (
      taskId: string,
      user: { userId: string; displayName: string; username: string; email?: string; avatarUrl?: string },
    ) => {
      await api.tasks.addAssignee(taskId, user.userId);
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, assignees: [...(t.assignees || []), user] } : t,
        ),
      }));
    },
    [],
  );

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

  // bucket.updated (e.g. from MoveBucket) patches a bucket's `position` in
  // place without reordering the array — sort here so every consumer sees
  // column order reflect the latest position, not just the tab that
  // triggered the move (which reorders via its own refetch instead).
  const sortedBuckets = [...state.buckets].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );

  return (
    <TasksContext.Provider
      value={{
        tasks: state.tasks,
        buckets: sortedBuckets,
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
