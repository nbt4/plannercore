import { useState, useEffect } from 'react';
import { CheckSquare, Plus, Trash2, GripVertical } from 'lucide-react';
import { api } from '../../services/plannerApi';

interface ChecklistItem {
  id: string;
  title: string;
  isCompleted: boolean;
  position?: number;
}

interface ChecklistSectionProps {
  taskId: string;
  onProgressChanged?: () => void;
}

export default function ChecklistSection({ taskId, onProgressChanged }: ChecklistSectionProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (taskId) {
      api.tasks.get(taskId).then((task) => {
        if (task.checklistItems) setItems(task.checklistItems);
      }).catch(() => {});
    }
  }, [taskId]);

  const completed = items.filter((i) => i.isCompleted).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const created = await api.checklists.add(taskId, title);
      setItems((prev) => [...prev, created]);
      setNewTitle('');
      onProgressChanged?.();
    } catch (e) {
      /* silently fail */
    }
  };

  const handleToggle = async (id: string) => {
    const currentItem = items.find((i) => i.id === id);
    const newCompleted = !currentItem?.isCompleted;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isCompleted: newCompleted } : item,
      ),
    );
    try {
      await api.checklists.toggle(id, newCompleted);
      onProgressChanged?.();
    } catch (e) {
      /* revert on error - we don't have previous state easily, just refetch */
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isCompleted: !item.isCompleted } : item,
        ),
      );
    }
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      await api.checklists.delete(id);
      onProgressChanged?.();
    } catch (e) {
      /* silently fail - item already removed optimistically */
    }
  };

  const handleStartEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditValue(item.title);
  };

  const handleSaveEdit = async (id: string) => {
    const title = editValue.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title } : item)),
    );
    setEditingId(null);
    try {
      await api.checklists.updateTitle(id, title);
    } catch (e) {
      /* silently fail */
    }
  };

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
        }}
      >
        <CheckSquare size={16} style={{ color: 'var(--text-secondary)' }} />
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
          }}
        >
          Checkliste
        </span>
        {total > 0 && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              marginLeft: 'var(--space-1)',
            }}
          >
            {completed}/{total}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div
          style={{
            width: '100%',
            height: '4px',
            backgroundColor: 'var(--surface-4)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
            marginBottom: 'var(--space-2)',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-success)',
              transition: 'width var(--transition-fast)',
            }}
          />
        </div>
      )}

      {/* Checklist items */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-1) var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              transition: 'background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <button
              onClick={() => handleToggle(item.id)}
              style={{
                width: 18,
                height: 18,
                borderRadius: 'var(--radius-sm)',
                border: `2px solid ${item.isCompleted ? 'var(--color-success)' : 'var(--border-strong)'}`,
                backgroundColor: item.isCompleted ? 'var(--color-success)' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                padding: 0,
                transition: 'all var(--transition-fast)',
              }}
            >
              {item.isCompleted && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            {editingId === item.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleSaveEdit(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit(item.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                style={{
                  flex: 1,
                  padding: '2px var(--space-1)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid var(--color-accent-red)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-sm)',
                  outline: 'none',
                }}
              />
            ) : (
              <span
                onClick={() => handleStartEdit(item)}
                style={{
                  flex: 1,
                  fontSize: 'var(--text-sm)',
                  color: item.isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: item.isCompleted ? 'line-through' : 'none',
                  cursor: 'text',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.title}
              </span>
            )}

            <button
              onClick={() => handleDelete(item.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity var(--transition-fast)',
                flexShrink: 0,
              }}
              className="checklist-delete-btn"
              title="Löschen"
            >
              <Trash2 size={14} />
            </button>
            <style>{`
              div:hover > .checklist-delete-btn { opacity: 1; }
            `}</style>
          </div>
        ))}
      </div>

      {/* Add new item */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-2)',
        }}
      >
        <Plus size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          placeholder="Neues Element"
          style={{
            flex: 1,
            padding: 'var(--space-1) var(--space-2)',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}
