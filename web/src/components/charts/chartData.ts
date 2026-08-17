export interface CountDatum {
  name: string;
  value: number;
}

export function buildBucketData(tasks: any[], buckets: any[]): CountDatum[] {
  const bucketNames = new Map(buckets.map((bucket) => [bucket.id, bucket.name]));
  const counts = new Map<string, number>();

  tasks.forEach((task) => {
    const name = task.bucketId
      ? bucketNames.get(task.bucketId) || 'Unbekannte Spalte'
      : 'Nicht zugewiesen';
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  return [...counts.entries()].map(([name, value]) => ({ name, value }));
}

export function buildPriorityData(tasks: any[], priorityOrder: string[]): CountDatum[] {
  const counts = new Map<string, number>();
  tasks.forEach((task) => {
    const priority = String(task.priority || '').toLowerCase();
    if (priority) counts.set(priority, (counts.get(priority) || 0) + 1);
  });

  return priorityOrder
    .map((priority) => ({
      name: priority.charAt(0).toUpperCase() + priority.slice(1),
      value: counts.get(priority) || 0,
    }))
    .filter((datum) => datum.value > 0);
}

export function buildWorkloadData(workload: any[]) {
  return (workload || [])
    .map((entry) => ({
      name: entry.username || entry.userId || entry.name || 'Unbekannt',
      tasks: entry.totalTasks ?? entry.taskCount ?? entry.tasks ?? 0,
      completed: entry.completedTasks ?? entry.completedCount ?? entry.completed ?? 0,
    }))
    .filter((entry) => entry.tasks > 0 || entry.completed > 0);
}
