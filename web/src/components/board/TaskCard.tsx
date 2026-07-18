import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar } from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS, STYLES } from '../../lib/constants';
import PriorityBadge from '../shared/PriorityBadge';
import LabelBadge from '../shared/LabelBadge';
import ProgressBar from '../shared/ProgressBar';
import Avatar from '../shared/Avatar';
import type { TaskCardData } from './types';

interface TaskCardProps {
  task: TaskCardData;
  onClick?: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    backgroundColor: STYLES.cardBg,
    borderRadius: STYLES.cardRadius,
    boxShadow: STYLES.cardShadow,
    border: 'var(--border-default)',
    cursor: isDragging ? 'grabbing' : 'grab',
    padding: 'var(--space-3)',
  };

  if (isDragging) {
    style.zIndex = 999;
  }

  const isOverdue = task.isLate ?? false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
          {task.labels.map((label) => (
            <LabelBadge key={label.id} name={label.name} color={label.color} />
          ))}
        </div>
      )}

      {/* Title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
        }}
      >
        {task.status && (
          <span
            title={STATUS_LABELS[task.status] || task.status}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: STATUS_COLORS[task.status] || 'var(--text-muted)',
              flexShrink: 0,
              marginTop: 5,
            }}
          />
        )}
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-primary)',
            lineHeight: 'var(--leading-snug)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {task.title}
        </div>
      </div>

      {/* Priority */}
      {task.priority && (
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <PriorityBadge priority={task.priority} />
        </div>
      )}

      {/* Progress Bar */}
      {task.progress != null && task.progress > 0 && (
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <ProgressBar progress={task.progress} />
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        {/* Assignees */}
        {task.assignees && task.assignees.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {task.assignees.slice(0, 3).map((a, i) => (
              <div
                key={a.userId}
                style={{
                  marginLeft: i > 0 ? '-6px' : 0,
                  zIndex: task.assignees!.length - i,
                }}
              >
                <Avatar username={a.username || a.userId} avatarUrl={a.avatarUrl} size="sm" />
              </div>
            ))}
            {task.assignees.length > 3 && (
              <span
                style={{
                  marginLeft: 'var(--space-1)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                }}
              >
                +{task.assignees.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Checklist progress */}
        {task.checklistTotalCount != null && task.checklistTotalCount > 0 && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {task.checklistCompletedCount ?? 0}/{task.checklistTotalCount}
          </span>
        )}

        {/* Due date */}
        {task.dueDate && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: 'var(--text-xs)',
              color: isOverdue ? 'var(--color-error)' : 'var(--text-muted)',
              fontWeight: isOverdue ? 'var(--weight-medium)' : 'var(--weight-normal)',
              whiteSpace: 'nowrap',
            }}
          >
            <Calendar size={12} />
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
