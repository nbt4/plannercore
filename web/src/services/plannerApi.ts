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
      if (filters?.bucket) params.set('bucket', filters.bucket);
      if (filters?.label) params.set('label', filters.label);
      if (filters?.assignee) params.set('assignee', filters.assignee);
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
    reorder: (planId: string, items: any[]) =>
      request<void>(`${BASE}/plans/${planId}/tasks/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
    updateProgress: (taskId: string, progress: number) =>
      request<any>(`${BASE}/tasks/${taskId}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress }),
      }),
  },

  checklists: {
    add: (taskId: string, title: string) =>
      request<any>(`${BASE}/tasks/${taskId}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    toggle: (id: string) =>
      request<any>(`${BASE}/checklists/${id}`, { method: 'PUT' }),
    delete: (id: string) =>
      request<void>(`${BASE}/checklists/${id}`, { method: 'DELETE' }),
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

  labels: {
    list: (planId: string) => request<any[]>(`${BASE}/plans/${planId}/labels`),
    create: (planId: string, name: string, color: string) =>
      request<any>(`${BASE}/plans/${planId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/labels/${id}`, { method: 'DELETE' }),
  },

  my: {
    tasks: () => request<any[]>(`${BASE}/my/tasks`),
    day: () => request<any[]>(`${BASE}/my/day`),
    addDay: (taskId: string) =>
      request<any>(`${BASE}/my/day/${taskId}`, { method: 'POST' }),
    removeDay: (taskId: string) =>
      request<void>(`${BASE}/my/day/${taskId}`, { method: 'DELETE' }),
  },

  timeline: {
    get: (planId: string) => request<any[]>(`${BASE}/plans/${planId}/timeline`),
    addDependency: (taskId: string, predecessorId: string, type?: string) =>
      request<any>(`${BASE}/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predecessorId, type }),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/dependencies/${id}`, { method: 'DELETE' }),
  },

  sprints: {
    list: (planId: string) => request<any[]>(`${BASE}/plans/${planId}/sprints`),
    create: (planId: string, data: any) =>
      request<any>(`${BASE}/plans/${planId}/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<any>(`${BASE}/sprints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/sprints/${id}`, { method: 'DELETE' }),
  },

  goals: {
    list: (planId: string) => request<any[]>(`${BASE}/plans/${planId}/goals`),
    create: (planId: string, data: any) =>
      request<any>(`${BASE}/plans/${planId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<any>(`${BASE}/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/goals/${id}`, { method: 'DELETE' }),
  },

  analytics: {
    taskChart: (planId: string) => request<any>(`${BASE}/plans/${planId}/analytics/task-chart`),
    workload: (planId: string) => request<any>(`${BASE}/plans/${planId}/analytics/workload`),
    burndown: (planId: string) => request<any>(`${BASE}/plans/${planId}/analytics/burndown`),
  },
};
