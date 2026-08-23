export interface CompletableTask {
  status?: string;
  completedAt?: string | null;
  completed?: boolean;
}

export function isTaskCompleted(task: CompletableTask): boolean {
  return task.status === 'completed' || Boolean(task.completedAt) || task.completed === true;
}

export function tasksByCompletion<T extends CompletableTask>(
  tasks: T[],
  showCompleted: boolean,
): T[] {
  return showCompleted ? tasks : tasks.filter((task) => !isTaskCompleted(task));
}

export function completedTaskCount(tasks: CompletableTask[]): number {
  return tasks.filter(isTaskCompleted).length;
}
