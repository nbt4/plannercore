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
import { usePlanTasks } from '../../contexts/TasksContext';
import BucketColumn from './BucketColumn';
import AddBucketInline from './AddBucketInline';
import EmptyState from '../shared/EmptyState';
import FilterBar from '../shared/FilterBar';
import TaskDetailPanel from '../tasks/TaskDetailPanel';
import { EMPTY_FILTERS, assigneeOptionsFromTasks, filterTasks, type TaskFilters } from '../../lib/taskFilters';
import type { TaskCardData } from './types';

export default function BoardView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks, buckets, reorderTask } = usePlanTasks();
  const [labels, setLabels] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);

  // Labels aren't part of live-sync (no label.* events exist yet) — kept as
  // BoardView's own fetch, same as before.
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.labels.list(planId).then(setLabels).catch(() => setLabels([]));
    } else {
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !planId) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      const activeTask = tasks.find((t: any) => t.id === activeId);
      if (!activeTask) return;

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

      const srcBucketId = activeTask.bucketId || '__unassigned__';
      const destBucketId = newBucketId || '__unassigned__';

      const grouped: Record<string, any[]> = {};
      tasks.forEach((t: any) => {
        const bid = t.bucketId || '__unassigned__';
        if (!grouped[bid]) grouped[bid] = [];
        grouped[bid].push({ ...t });
      });

      grouped[srcBucketId] = (grouped[srcBucketId] || []).filter((t: any) => t.id !== activeId);
      if (!grouped[destBucketId]) grouped[destBucketId] = [];

      const updatedTask = { ...activeTask, bucketId: newBucketId || '' };

      if (overTaskId) {
        const overIdx = grouped[destBucketId].findIndex((t: any) => t.id === overTaskId);
        if (overIdx >= 0) {
          grouped[destBucketId].splice(overIdx, 0, updatedTask);
        } else {
          grouped[destBucketId].push(updatedTask);
        }
      } else {
        grouped[destBucketId].push(updatedTask);
      }

      const allTasks: any[] = [];
      Object.entries(grouped).forEach(([bid, arr]) => {
        arr.forEach((t: any, i: number) => {
          allTasks.push({
            id: t.id,
            bucketId: bid === '__unassigned__' ? '' : bid,
            position: i,
          });
        });
      });

      reorderTask(allTasks).catch(() => {});
    },
    [planId, tasks, buckets, reorderTask],
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
              onTaskClick={(taskId) => setSelectedTaskId(taskId)}
            />
          ))}
          <AddBucketInline planId={planId} />
        </div>
      </DndContext>
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          planId={planId}
          onTaskDeleted={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
