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
