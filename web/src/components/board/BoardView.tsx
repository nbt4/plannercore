import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Kanban, type LucideIcon } from 'lucide-react';
import {
  DndContext,
  DragCancelEvent,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCorners,
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
import {
  groupTasksForDrag,
  moveTaskInGroups,
  reorderPayload,
  UNASSIGNED_BUCKET_ID,
  type TaskGroups,
} from './boardDrag';

export default function BoardView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks, buckets, reorderTask } = usePlanTasks();
  const [labels, setLabels] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [dragGroups, setDragGroups] = useState<TaskGroups | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const dragGroupsRef = useRef<TaskGroups | null>(null);

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

  const bucketIds = useMemo(() => buckets.map((bucket) => bucket.id), [buckets]);
  const filteredTaskIds = useMemo(
    () => new Set(filteredTasks.map((task) => task.id)),
    [filteredTasks],
  );

  // While dragging, render the in-memory order immediately. This makes the
  // insertion point deterministic instead of making users guess until drop.
  const tasksByBucket = useMemo(() => {
    const grouped = dragGroups || groupTasksForDrag(filteredTasks as TaskCardData[], bucketIds);
    if (!dragGroups) return grouped;

    return Object.fromEntries(
      Object.entries(grouped).map(([bucketId, groupedTasks]) => [
        bucketId,
        groupedTasks.filter((task) => filteredTaskIds.has(task.id)),
      ]),
    );
  }, [bucketIds, dragGroups, filteredTaskIds, filteredTasks]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const grouped = groupTasksForDrag(tasks as TaskCardData[], bucketIds);
    dragGroupsRef.current = grouped;
    setDragGroups(grouped);
    setActiveTaskId(activeId);
  }, [bucketIds, tasks]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (!event.over || !dragGroupsRef.current) return;
    const next = moveTaskInGroups(
      dragGroupsRef.current,
      String(event.active.id),
      String(event.over.id),
    );
    if (next === dragGroupsRef.current) return;
    dragGroupsRef.current = next;
    setDragGroups(next);
  }, []);

  const resetDrag = useCallback((_event?: DragCancelEvent) => {
    dragGroupsRef.current = null;
    setDragGroups(null);
    setActiveTaskId(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const finalGroups = dragGroupsRef.current;
    const shouldPersist = Boolean(event.over && finalGroups && planId);
    resetDrag();
    if (!shouldPersist || !finalGroups) return;
    reorderTask(reorderPayload(finalGroups, bucketIds)).catch(() => {});
  }, [bucketIds, planId, reorderTask, resetDrag]);

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
    const unassigned = tasksByBucket[UNASSIGNED_BUCKET_ID];
    if (unassigned && unassigned.length > 0) {
      cols.push({
        bucket: { id: UNASSIGNED_BUCKET_ID, name: 'Nicht zugewiesen' },
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
      className="planner-board-view"
      style={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        padding: 'var(--space-4)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <FilterBar
        filters={filters}
        onChange={setFilters}
        buckets={buckets}
        labels={labels}
        assignees={assigneeOptions}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={resetDrag}
        onDragEnd={handleDragEnd}
      >
        <div
          className="planner-board-columns"
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            flex: 1,
            minHeight: 0,
            alignItems: 'flex-start',
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: 'var(--space-1) var(--space-1) var(--space-3)',
            scrollbarGutter: 'stable',
            overscrollBehaviorX: 'contain',
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
        <DragOverlay dropAnimation={null}>
          {activeTaskId && (
            <div
              style={{
                width: 340,
                padding: 'var(--space-3)',
                backgroundColor: 'var(--surface-1)',
                border: '1px solid var(--color-info)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-xl)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-medium)',
                cursor: 'grabbing',
              }}
            >
              {tasks.find((task) => task.id === activeTaskId)?.title}
            </div>
          )}
        </DragOverlay>
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
