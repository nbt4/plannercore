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
    members: (id: string) => request<any[]>(`${BASE}/plans/${id}/members`),
    addMember: (id: string, userId: string) =>
      request<any>(`${BASE}/plans/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    removeMember: (id: string, userId: string) =>
      request<void>(`${BASE}/plans/${id}/members/${userId}`, { method: 'DELETE' }),
  },

  buckets: {
    list: (planId: string) => request<any[]>(`${BASE}/${planId}/buckets`),
    create: (planId: string, name: string) =>
      request<any>(`${BASE}/${planId}/buckets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    update: (planId: string, id: string, name: string) =>
      request<any>(`${BASE}/${planId}/buckets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/${planId}/buckets/${id}`, { method: 'DELETE' }),
    move: (planId: string, id: string, direction: 'left' | 'right') =>
      request<void>(`${BASE}/${planId}/buckets/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      }),
    reorder: (planId: string, bucketIds: string[]) =>
      request<void>(`${BASE}/${planId}/buckets/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketIds }),
      }),
  },

  tasks: {
    list: (planId: string, filters?: { bucket?: string; label?: string; assignee?: string }) => {
      const params = new URLSearchParams();
      if (filters?.bucket) params.set('bucketId', filters.bucket);
      if (filters?.label) params.set('labelId', filters.label);
      if (filters?.assignee) params.set('assigneeId', filters.assignee);
      const qs = params.toString();
      return request<any[]>(`${BASE}/${planId}/tasks${qs ? `?${qs}` : ''}`);
    },
    get: (taskId: string) => request<any>(`${BASE}/tasks/${taskId}`),
    create: (planId: string, title: string, bucketId?: string) =>
      request<any>(`${BASE}/${planId}/tasks`, {
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
      request<void>(`${BASE}/${planId}/tasks/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      }),
    addAssignee: (taskId: string, userId: string) =>
      request<any>(`${BASE}/tasks/${taskId}/assignees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    removeAssignee: (taskId: string, userId: string) =>
      request<void>(`${BASE}/tasks/${taskId}/assignees/${userId}`, { method: 'DELETE' }),
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
    updateTitle: (id: string, title: string) =>
      request<any>(`${BASE}/checklist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
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
    list: (planId: string) => request<any[]>(`${BASE}/${planId}/labels`),
    create: (planId: string, name: string, color: string) =>
      request<any>(`${BASE}/${planId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/${planId}/labels/${id}`, { method: 'DELETE' }),
  },

  users: {
    search: (q: string) =>
      request<{ userId: string; displayName: string; username: string; email: string; avatarUrl: string }[]>(
        `${BASE}/users${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ),
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
    get: (planId: string) => request<any>(`${BASE}/${planId}/timeline`),
    addDependency: (planId: string, predecessorId: string, successorId: string, type?: string) =>
      request<any>(`${BASE}/${planId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predecessorId, successorId, dependencyType: type || 'finish-to-start' }),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/${planId}/dependencies/${id}`, { method: 'DELETE' }),
  },

  // FIXED: Sprints use plan-scoped paths for update/delete
  sprints: {
    list: (planId: string) => request<any[]>(`${BASE}/${planId}/sprints`),
    create: (planId: string, data: any) =>
      request<any>(`${BASE}/${planId}/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (planId: string, id: string, data: any) =>
      request<any>(`${BASE}/${planId}/sprints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/${planId}/sprints/${id}`, { method: 'DELETE' }),
    addTasks: (planId: string, sprintId: string, taskIds: string[]) =>
      request<any>(`${BASE}/${planId}/sprints/${sprintId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      }),
  },

  // FIXED: Goals use plan-scoped paths for update/delete
  goals: {
    list: (planId: string) => request<any>(`${BASE}/${planId}/goals`),
    create: (planId: string, data: any) =>
      request<any>(`${BASE}/${planId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (planId: string, id: string, data: any) =>
      request<any>(`${BASE}/${planId}/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (planId: string, id: string) =>
      request<void>(`${BASE}/${planId}/goals/${id}`, { method: 'DELETE' }),
  },

  // FIXED: Analytics use correct backend endpoint names
  analytics: {
    taskChart: (planId: string) => request<any>(`${BASE}/${planId}/analytics/tasks`),
    workload: (planId: string) => request<any>(`${BASE}/${planId}/analytics/workload`),
    burndown: (planId: string) => request<any>(`${BASE}/${planId}/analytics/burndown`),
  },
};
