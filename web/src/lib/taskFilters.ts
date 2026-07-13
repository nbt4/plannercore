export interface TaskFilters {
  bucketId: string;
  assigneeId: string;
  priority: string;
  status: string;
  labelId: string;
}

export const EMPTY_FILTERS: TaskFilters = {
  bucketId: '',
  assigneeId: '',
  priority: '',
  status: '',
  labelId: '',
};

export function filterTasks(tasks: any[], filters: TaskFilters): any[] {
  return tasks.filter((t) => {
    if (filters.bucketId && t.bucketId !== filters.bucketId) return false;
    if (
      filters.assigneeId &&
      !(t.assignees || []).some((a: any) => a.userId === filters.assigneeId)
    )
      return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.labelId && !(t.labels || []).some((l: any) => l.id === filters.labelId))
      return false;
    return true;
  });
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return Object.values(filters).some((v) => v !== '');
}

export function assigneeOptionsFromTasks(
  tasks: any[],
): { userId: string; username: string }[] {
  const map = new Map<string, string>();
  tasks.forEach((t) => {
    (t.assignees || []).forEach((a: any) => {
      if (!map.has(a.userId)) map.set(a.userId, a.username || a.userId);
    });
  });
  return Array.from(map.entries())
    .map(([userId, username]) => ({ userId, username }))
    .sort((a, b) => a.username.localeCompare(b.username));
}
