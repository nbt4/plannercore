import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/plannerApi';

interface AddTaskInlineProps {
  planId: string;
  bucketId?: string;
  onTaskAdded?: () => void;
}

export default function AddTaskInline({ planId, bucketId, onTaskAdded }: AddTaskInlineProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await api.tasks.create(planId, trimmed, bucketId);
      setTitle('');
      setExpanded(false);
      onTaskAdded?.();
    } catch (e) {
      /* silently fail */
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
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
          width: '100%',
          padding: 'var(--space-2) var(--space-3)',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-2)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
        }}
      >
        <Plus size={16} />
        <span>Aufgabe hinzufügen</span>
      </button>
    );
  }

  return (
    <div style={{ padding: 'var(--space-2) var(--space-2)' }}>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!title.trim()) {
            setExpanded(false);
          } else {
            handleAdd();
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
