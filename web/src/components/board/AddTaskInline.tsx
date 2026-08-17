import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { usePlanTasks } from '../../contexts/TasksContext';

interface AddTaskInlineProps {
  planId: string;
  bucketId?: string;
  compact?: boolean;
}

export default function AddTaskInline({ bucketId, compact = false }: AddTaskInlineProps) {
  const { createTask } = usePlanTasks();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleAdd = (closeAfterSubmit = false) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    // Clear the field immediately so rapid Enter presses feel continuous,
    // while serialising requests keeps their server-side positions stable.
    setTitle('');
    if (closeAfterSubmit) {
      setExpanded(false);
    } else {
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    submissionQueue.current = submissionQueue.current
      .then(async () => {
        await createTask(trimmed, bucketId);
      })
      .catch(() => {
        // Keep the quick-entry flow available even if one request fails.
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd(false);
    } else if (e.key === 'Escape') {
      setTitle('');
      setExpanded(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          width: compact ? 'auto' : '100%',
          padding: compact ? 'var(--space-2) var(--space-3)' : 'var(--space-2) var(--space-3)',
          backgroundColor: compact ? 'var(--color-accent-red)' : 'transparent',
          border: compact ? '1px solid var(--color-accent-red)' : 'none',
          borderRadius: 'var(--radius-md)',
          color: compact ? '#fff' : 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          if (!compact) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-2)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!compact) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }
        }}
      >
        <Plus size={16} />
        <span>{compact ? 'Neue Aufgabe' : 'Aufgabe hinzufügen'}</span>
      </button>
    );
  }

  return (
    <div style={{ padding: compact ? 0 : 'var(--space-2)', width: compact ? 240 : 'auto' }}>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!title.trim()) {
            setExpanded(false);
          } else {
            handleAdd(true);
          }
        }}
        placeholder="Aufgabentitel..."
        style={{
          width: '100%',
          padding: 'var(--space-2) var(--space-3)',
          backgroundColor: 'var(--surface-0)',
          border: 'var(--border-input)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          outline: 'none',
        }}
      />
    </div>
  );
}
