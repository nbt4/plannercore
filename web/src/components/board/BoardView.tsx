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
import { useTasks } from '../../hooks/useTasks';
import BucketColumn from './BucketColumn';
import AddBucketInline from './AddBucketInline';
import EmptyState from '../shared/EmptyState';
import FilterBar from '../shared/FilterBar';
import TaskDetailPanel from '../tasks/TaskDetailPanel';
import { EMPTY_FILTERS, assigneeOptionsFromTasks, filterTasks, type TaskFilters } from '../../lib/taskFilters';
import type { TaskCardData } from './types';

export default function BoardView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks, setTasks } = useTasks(planId || '');
  const [buckets, setBuckets] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);

  // Load buckets and labels
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.buckets
        .list(planId)
        .then(setBuckets)
        .catch(() => setBuckets([]));
      api.labels
        .list(planId)
        .then(setLabels)
        .catch(() => setLabels([]));
    } else {
      setBuckets([]);
      setLabels([]);
    }
  }, [planId]);

  const filteredTasks = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const assigneeOptions = useMemo(() => assigneeOptionsFromTasks(tasks), [tasks]);

  // Group tasks by bucket, sorted by position
  const { tasksByBucket, bucketIds } = useMemo(() => {
    const grouped: Record<string, TaskCardData[]> = {};

    // Initialize empty arrays for known buckets
    buckets.forEach((b) => {
      grouped[b.id] = [];
    });

    // Add tasks to their buckets
    filteredTasks.forEach((t: any) => {
      const bid = t.bucketId || '__unassigned__';
      if (!grouped[bid]) grouped[bid] = [];
      grouped[bid].push(t as TaskCardData);
    });

    // Sort each bucket's tasks by position
    Object.values(grouped).forEach((arr) =>
      arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    );

    const ids = [...new Set([...buckets.map((b) => b.id), '__unassigned__'])].filter(
      (id) => grouped[id] && (grouped[id].length > 0 || id !== '__unassigned__'),
    );

    return { tasksByBucket: grouped, bucketIds: ids };
  }, [buckets, filteredTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const refetchTasks = useCallback(() => {
    if (planId && planId !== 'new') {
      api.tasks
        .list(planId)
        .then(setTasks)
        .catch(() => {});
    }
  }, [planId, setTasks]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !planId) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      const activeTask = tasks.find((t: any) => t.id === activeId);
      if (!activeTask) return;

      // Determine destination bucket
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

      // Determine source bucket
      const srcBucketId = activeTask.bucketId || '__unassigned__';
      const destBucketId = newBucketId || '__unassigned__';

      // Build grouped task map (shallow clone to avoid mutation)
      const grouped: Record<string, any[]> = {};
      tasks.forEach((t: any) => {
        const bid = t.bucketId || '__unassigned__';
        if (!grouped[bid]) grouped[bid] = [];
        grouped[bid].push({ ...t });
      });

      // Remove from source
      grouped[srcBucketId] = (grouped[srcBucketId] || []).filter(
        (t: any) => t.id !== activeId,
      );

      // Add to destination
      if (!grouped[destBucketId]) grouped[destBucketId] = [];

      const updatedTask = { ...activeTask, bucketId: newBucketId || '' };

      if (overTaskId && destBucketId === srcBucketId) {
        // Same bucket, find insertion index relative to over task
        const overIdx = grouped[destBucketId].findIndex(
          (t: any) => t.id === overTaskId,
        );
        if (overIdx >= 0) {
          grouped[destBucketId].splice(overIdx, 0, updatedTask);
        } else {
          grouped[destBucketId].push(updatedTask);
        }
      } else if (overTaskId) {
        // Different bucket, find insertion index
        const overIdx = grouped[destBucketId].findIndex(
          (t: any) => t.id === overTaskId,
        );
        if (overIdx >= 0) {
          grouped[destBucketId].splice(overIdx, 0, updatedTask);
        } else {
          grouped[destBucketId].push(updatedTask);
        }
      } else {
        // Dropped on bucket directly - add to end
        grouped[destBucketId].push(updatedTask);
      }

      // Re-number positions and flatten
      const allTasks: any[] = [];
      Object.entries(grouped).forEach(([bid, arr]) => {
        arr.forEach((t: any, i: number) => {
          allTasks.push({
            ...t,
            bucketId: bid === '__unassigned__' ? '' : bid,
            position: i,
          });
        });
      });

      // Optimistic update
      setTasks(allTasks);

      // Call the API
      const items = allTasks.map((t: any) => ({
        id: t.id,
        bucketId: t.bucketId,
        position: t.position,
      }));
      api.tasks.reorder(planId, items).catch(() => {
        refetchTasks();
      });
    },
    [planId, tasks, buckets, setTasks, refetchTasks],
  );

  // Build merged list: bucket + its tasks
  const columns = useMemo(() => {
    const cols: { bucket: { id: string; name: string }; tasks: TaskCardData[] }[] = [];

    buckets.forEach((b) => {
      cols.push({
        bucket: { id: b.id, name: b.name },
        tasks: tasksByBucket[b.id] || [],
      });
    });

    // Add unassigned if there are unassigned tasks
    const unassigned = tasksByBucket['__unassigned__'];
    if (unassigned && unassigned.length > 0) {
      cols.push({
        bucket: { id: '__unassigned__', name: 'Unassigned' },
        tasks: unassigned,
      });
    }

    return cols;
  }, [buckets, tasksByBucket]);

  if (!planId || planId === 'new') {
    return (
      <EmptyState
        icon={Kanban}
        title="Wählen Sie einen Plan"
        description="Erstellen oder wählen Sie einen Plan aus der Seitenleiste, um das Board anzuzeigen."
      />
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 'var(--space-4)',
      }}
    >
      <FilterBar
        filters={filters}
        onChange={setFilters}
        buckets={buckets}
        labels={labels}
        assignees={assigneeOptions}
      />
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            height: '100%',
            alignItems: 'flex-start',
          }}
        >
          {columns.map((col, idx) => (
            <BucketColumn
              key={col.bucket.id}
              bucket={col.bucket}
              tasks={col.tasks}
              planId={planId}
              isFirst={idx === 0}
              isLast={idx === columns.length - 1}
              onBucketRenamed={(id, name) =>
                setBuckets((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)))
              }
              onBucketDeleted={(id) => {
                setBuckets((prev) => prev.filter((b) => b.id !== id));
                refetchTasks();
              }}
              onBucketMoved={() => {
                api.buckets.list(planId).then(setBuckets).catch(() => {});
              }}
              onTaskClick={(taskId) => setSelectedTaskId(taskId)}
            />
          ))}
          <AddBucketInline
            planId={planId}
            onBucketAdded={(bucket) => setBuckets((prev) => [...prev, bucket])}
          />
        </div>
      </DndContext>
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
    </div>
  );
}
