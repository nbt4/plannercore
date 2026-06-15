// FIXED: All API routes aligned with backend plan-scoped conventions.
// Checklists use plan-scoped paths, labels use plan-scoped paths,
// sprints/goals use plan-scoped update/delete, analytics use correct endpoints.
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

const BASE = '/api/v1/planner';

export const api = {
  plans: {
    list: () => request<any[]>(`${BASE}/plans`),
    get: (id: string) => request<any>(`${BASE}/plans/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<any>(`${BASE}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name?: string; description?: string }) =>
      request<any>(`${BASE}/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/plans/${id}`, { method: 'DELETE' }),
    copy: (id: string) =>
      request<any>(`${BASE}/plans/${id}/copy`, { method: 'POST' }),
    toggleFavorite: (id: string) =>
      request<any>(`${BASE}/plans/${id}/favorite`, { method: 'POST' }),
  },

  buckets: {
    list: (planId: string) => request<any[]>(`${BASE}/plans/${planId}/buckets`),
    create: (planId: string, name: string) =>
      request<any>(`${BASE}/plans/${planId}/buckets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    update: (planId: string, id: string, name: string) =>
      request<any>(`${BASE}/plans/${planId}/buckets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/plans/${planId}/buckets/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (planId: string, filters?: { bucket?: string; label?: string; assignee?: string }) => {
      const params = new URLSearchParams();
      if (filters?.bucket) params.set('bucketId', filters.bucket);
      if (filters?.label) params.set('labelId', filters.label);
      if (filters?.assignee) params.set('assigneeId', filters.assignee);
      const qs = params.toString();
      return request<any[]>(`${BASE}/plans/${planId}/tasks${qs ? `?${qs}` : ''}`);
    },
    get: (taskId: string) => request<any>(`${BASE}/tasks/${taskId}`),
    create: (planId: string, title: string, bucketId?: string) =>
      request<any>(`${BASE}/plans/${planId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, bucketId }),
      }),
    update: (taskId: string, updates: any) =>
      request<any>(`${BASE}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    delete: (taskId: string) =>
      request<void>(`${BASE}/tasks/${taskId}`, { method: 'DELETE' }),
    // FIXED: reorder uses plan-scoped PUT with flat array (matching backend)
    reorder: (planId: string, items: any[]) =>
      request<void>(`${BASE}/plans/${planId}/tasks/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      }),
    updateProgress: (taskId: string, progress: number) =>
      request<any>(`${BASE}/tasks/${taskId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress }),
      }),
  },

  // FIXED: Checklists use plan/task-scoped paths matching backend
  checklists: {
    add: (taskId: string, title: string) =>
      request<any>(`${BASE}/tasks/${taskId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    toggle: (id: string, isCompleted: boolean) =>
      request<any>(`${BASE}/checklist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted }),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/checklist/${id}`, { method: 'DELETE' }),
  },

  comments: {
    list: (taskId: string) => request<any[]>(`${BASE}/tasks/${taskId}/comments`),
    add: (taskId: string, content: string) =>
      request<any>(`${BASE}/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
  },

  attachments: {
    upload: (taskId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<any>(`${BASE}/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: form,
      });
    },
    delete: (id: string) =>
      request<void>(`${BASE}/attachments/${id}`, { method: 'DELETE' }),
  },

  // FIXED: Labels use plan-scoped paths for all operations
  labels: {
    list: (planId: string) => request<any[]>(`${BASE}/plans/${planId}/labels`),
    create: (planId: string, name: string, color: string) =>
      request<any>(`${BASE}/plans/${planId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/plans/${planId}/labels/${id}`, { method: 'DELETE' }),
  },

  my: {
    tasks: () => request<any[]>(`${BASE}/my/tasks`),
    day: () => request<any[]>(`${BASE}/my/day`),
    addDay: (taskId: string) =>
      request<any>(`${BASE}/my/day/${taskId}`, { method: 'POST' }),
    removeDay: (taskId: string) =>
      request<void>(`${BASE}/my/day/${taskId}`, { method: 'DELETE' }),
  },

  // FIXED: Timeline uses plan-scoped routes matching backend
  timeline: {
    get: (planId: string) => request<any>(`${BASE}/plans/${planId}/timeline`),
    addDependency: (planId: string, predecessorId: string, successorId: string, type?: string) =>
      request<any>(`${BASE}/plans/${planId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predecessorId, successorId, dependencyType: type || 'finish-to-start' }),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/plans/${planId}/dependencies/${id}`, { method: 'DELETE' }),
  },

  // FIXED: Sprints use plan-scoped paths for update/delete
  sprints: {
    list: (planId: string) => request<any[]>(`${BASE}/plans/${planId}/sprints`),
    create: (planId: string, data: any) =>
      request<any>(`${BASE}/plans/${planId}/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (planId: string, id: string, data: any) =>
      request<any>(`${BASE}/plans/${planId}/sprints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/plans/${planId}/sprints/${id}`, { method: 'DELETE' }),
    addTasks: (planId: string, sprintId: string, taskIds: string[]) =>
      request<any>(`${BASE}/plans/${planId}/sprints/${sprintId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      }),
  },

  // FIXED: Goals use plan-scoped paths for update/delete
  goals: {
    list: (planId: string) => request<any>(`${BASE}/plans/${planId}/goals`),
    create: (planId: string, data: any) =>
      request<any>(`${BASE}/plans/${planId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (planId: string, id: string, data: any) =>
      request<any>(`${BASE}/plans/${planId}/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/plans/${planId}/goals/${id}`, { method: 'DELETE' }),
  },

  // FIXED: Analytics use correct backend endpoint names
  analytics: {
    taskChart: (planId: string) => request<any>(`${BASE}/plans/${planId}/analytics/tasks`),
    workload: (planId: string) => request<any>(`${BASE}/plans/${planId}/analytics/workload`),
    burndown: (planId: string) => request<any>(`${BASE}/plans/${planId}/analytics/burndown`),
  },
};
