import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MoreHorizontal } from 'lucide-react';
import { STYLES } from '../../lib/constants';
import TaskCard from './TaskCard';
import AddTaskInline from './AddTaskInline';
import type { TaskCardData } from './types';

interface BucketColumnProps {
  bucket: {
    id: string;
    name: string;
  };
  tasks: TaskCardData[];
  planId: string;
  onTaskClick?: (taskId: string) => void;
}

export default function BucketColumn({ bucket, tasks, planId, onTaskClick }: BucketColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 280,
        maxWidth: 340,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: STYLES.bucketBg,
        borderRadius: STYLES.cardRadius,
        border: isOver ? '1px solid var(--color-info)' : 'var(--border-default)',
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-3)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
            }}
          >
            {bucket.name}
          </h3>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--surface-2)',
              padding: '0 var(--space-2)',
              borderRadius: 'var(--radius-full)',
              lineHeight: '1.5',
            }}
          >
            {tasks.length}
          </span>
        </div>
        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 'var(--space-1)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Task list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 var(--space-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick?.(task.id)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add task */}
      <div style={{ flexShrink: 0 }}>
        <AddTaskInline planId={planId} bucketId={bucket.id} />
      </div>
    </div>
  );
}
