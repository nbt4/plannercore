import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/plannerApi';

interface AddBucketInlineProps {
  planId: string;
  onBucketAdded?: (bucket: any) => void;
}

export default function AddBucketInline({ planId, onBucketAdded }: AddBucketInlineProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const bucket = await api.buckets.create(planId, trimmed);
      setName('');
      setError(null);
      setExpanded(false);
      onBucketAdded?.(bucket);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spalte konnte nicht erstellt werden');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setName('');
      setError(null);
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
          minWidth: 280,
          maxWidth: 340,
          flexShrink: 0,
          padding: 'var(--space-3)',
          backgroundColor: 'transparent',
          border: 'var(--border-default)',
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
        <span>Spalte hinzufügen</span>
      </button>
    );
  }

  return (
    <div
      style={{
        minWidth: 280,
        maxWidth: 340,
        flexShrink: 0,
        padding: 'var(--space-3)',
        backgroundColor: 'var(--surface-1)',
        borderRadius: 'var(--radius-md)',
        border: 'var(--border-default)',
      }}
    >
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!name.trim()) {
            setExpanded(false);
            setError(null);
          } else {
            handleAdd();
          }
        }}
        placeholder="Spaltenname..."
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
      {error && (
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
