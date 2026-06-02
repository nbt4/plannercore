import { useState, useEffect } from 'react';
import { api } from '../services/plannerApi';

export function useTasks(
  planId: string,
  filters?: { bucket?: string; label?: string; assignee?: string },
) {
  const [tasks, setTasks] = useState<any[]>([]);
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.tasks
        .list(planId, filters)
        .then(setTasks)
        .catch(() => setTasks([]));
    } else {
      setTasks([]);
    }
  }, [planId, filters?.bucket, filters?.label, filters?.assignee]);
  return { tasks, setTasks };
}
