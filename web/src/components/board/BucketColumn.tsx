import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal, ArrowLeft, ArrowRight, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { STYLES } from '../../lib/constants';
import { usePlanTasks } from '../../contexts/TasksContext';
import TaskCard from './TaskCard';
import AddTaskInline from './AddTaskInline';
import type { TaskCardData } from './types';
import { UNASSIGNED_BUCKET_ID } from './boardDrag';

interface BucketColumnProps {
  bucket: {
    id: string;
    name: string;
  };
  tasks: TaskCardData[];
  planId: string;
  isFirst?: boolean;
  isLast?: boolean;
  onTaskClick?: (taskId: string) => void;
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  background: 'none',
  border: 'none',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  textAlign: 'left',
};

export default function BucketColumn({
  bucket,
  tasks,
  planId,
  isFirst,
  isLast,
  onTaskClick,
}: BucketColumnProps) {
  const { updateBucket, deleteBucket, moveBucket, updateTask } = usePlanTasks();
  const isUnassigned = bucket.id === UNASSIGNED_BUCKET_ID;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: bucket.id,
    data: { type: 'task-container' },
  });
  const {
    attributes: bucketAttributes,
    listeners: bucketListeners,
    setNodeRef: setSortableRef,
    transform: bucketTransform,
    transition: bucketTransition,
    isDragging: isBucketDragging,
  } = useSortable({
    id: `bucket:${bucket.id}`,
    data: { type: 'bucket', bucketId: bucket.id },
    disabled: isUnassigned,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(bucket.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  const handleRenameSave = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === bucket.name) {
      setNameValue(bucket.name);
      setRenaming(false);
      setRenameError(null);
      return;
    }
    try {
      await updateBucket(bucket.id, trimmed);
      setRenameError(null);
      setRenaming(false);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Umbenennen fehlgeschlagen');
    }
  };

  const handleMove = async (direction: 'left' | 'right') => {
    setMenuOpen(false);
    try {
      await moveBucket(bucket.id, direction);
      setMoveError(null);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : 'Verschieben fehlgeschlagen');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteBucket(bucket.id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };

  return (
    <div
      ref={setSortableRef}
      style={{
        width: 340,
        minWidth: 340,
        flex: '0 0 340px',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: STYLES.bucketBg,
        borderRadius: STYLES.cardRadius,
        border: isOver ? '1px solid var(--color-info)' : 'var(--border-default)',
        overflow: 'visible',
        position: 'relative',
        zIndex: menuOpen ? 20 : 1,
        transform: isBucketDragging ? undefined : CSS.Transform.toString(bucketTransform),
        transition: bucketTransition,
        opacity: isBucketDragging ? 0.45 : 1,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: 0 }}>
          {renaming ? (
            <input
              ref={renameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRenameSave();
                } else if (e.key === 'Escape') {
                  setNameValue(bucket.name);
                  setRenaming(false);
                  setRenameError(null);
                }
              }}
              onBlur={handleRenameSave}
              style={{
                width: '100%',
                padding: '1px var(--space-1)',
                backgroundColor: 'var(--surface-0)',
                border: 'var(--border-input)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                outline: 'none',
              }}
            />
          ) : (
            <h3
              style={{
                margin: 0,
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {bucket.name}
            </h3>
          )}
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--surface-2)',
              padding: '0 var(--space-2)',
              borderRadius: 'var(--radius-full)',
              lineHeight: '1.5',
              flexShrink: 0,
            }}
          >
            {tasks.length}
          </span>
        </div>
        {!isUnassigned && (
          <button
            type="button"
            aria-label={`Liste ${bucket.name} verschieben`}
            title="Liste nach links oder rechts ziehen"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 'var(--space-1)',
              padding: 'var(--space-1)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              cursor: isBucketDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              flexShrink: 0,
            }}
            {...bucketAttributes}
            {...bucketListeners}
          >
            <GripVertical size={16} />
          </button>
        )}
        {!isUnassigned && <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
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
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 'var(--space-1)',
                backgroundColor: 'var(--surface-1)',
                border: 'var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-dropdown)',
                minWidth: 190,
                zIndex: 100,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setRenaming(true);
                }}
                style={menuItemStyle}
              >
                <Pencil size={14} />
                <span>Umbenennen</span>
              </button>
              {!isFirst && (
                <button onClick={() => handleMove('left')} style={menuItemStyle}>
                  <ArrowLeft size={14} />
                  <span>Nach links verschieben</span>
                </button>
              )}
              {!isLast && (
                <button onClick={() => handleMove('right')} style={menuItemStyle}>
                  <ArrowRight size={14} />
                  <span>Nach rechts verschieben</span>
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmingDelete(true);
                  setDeleteError(null);
                }}
                style={{ ...menuItemStyle, color: 'var(--color-danger)' }}
              >
                <Trash2 size={14} />
                <span>Löschen</span>
              </button>
            </div>
          )}
        </div>}
      </div>

      {moveError && (
        <div
          style={{
            padding: '0 var(--space-3) var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger)',
          }}
        >
          {moveError}
        </div>
      )}
      {renaming && renameError && (
        <div
          style={{
            padding: '0 var(--space-3) var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger)',
          }}
        >
          {renameError}
        </div>
      )}

      {confirmingDelete && (
        <div
          style={{
            margin: '0 var(--space-3) var(--space-2)',
            padding: 'var(--space-2)',
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ marginBottom: 'var(--space-2)' }}>
            Spalte löschen? Aufgaben werden nicht gelöscht, sondern nicht mehr zugeordnet.
          </div>
          {deleteError && (
            <div style={{ marginBottom: 'var(--space-2)', color: 'var(--color-danger)' }}>{deleteError}</div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={handleDeleteConfirm}
              style={{
                padding: 'var(--space-1) var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-danger)',
                backgroundColor: 'transparent',
                color: 'var(--color-danger)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-medium)',
                cursor: 'pointer',
              }}
            >
              Löschen
            </button>
            <button
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteError(null);
              }}
              style={{
                padding: 'var(--space-1) var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                border: 'var(--border-default)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div
        ref={setDropRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
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
              onToggleCompleted={(completed) => updateTask(task.id, {
                status: completed ? 'completed' : 'not-started',
              })}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add task */}
      <div style={{ flexShrink: 0 }}>
        <AddTaskInline
          planId={planId}
          bucketId={isUnassigned ? undefined : bucket.id}
        />
      </div>
    </div>
  );
}
