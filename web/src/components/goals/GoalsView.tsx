import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Target, Plus, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '../../services/plannerApi';
import ProgressBar from '../shared/ProgressBar';
import EmptyState from '../shared/EmptyState';

interface Goal {
  id: string;
  title: string;
  progress?: number;
  status?: string;
  parentId?: string | null;
  children?: Goal[];
}

export default function GoalsView() {
  const { planId } = useParams<{ planId: string }>();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchGoals = async () => {
    if (!planId || planId === 'new') {
      setGoals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.goals.list(planId);
      // Build hierarchy
      const topLevel: Goal[] = [];
      const childMap: Record<string, Goal[]> = {};

      (data || []).forEach((g: Goal) => {
        if (g.parentId) {
          if (!childMap[g.parentId]) childMap[g.parentId] = [];
          childMap[g.parentId].push(g);
        } else {
          topLevel.push(g);
        }
      });

      const addChildren = (goals: Goal[]): Goal[] =>
        goals.map((g) => ({
          ...g,
          children: childMap[g.id] ? addChildren(childMap[g.id]) : [],
        }));

      setGoals(addChildren(topLevel));
    } catch (e) {
      setGoals([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGoals();
  }, [planId]);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title || !planId) return;
    try {
      await api.goals.create(planId, { title });
      setNewTitle('');
      setShowNewInput(false);
      fetchGoals();
    } catch (e) {
      /* silently fail */
    }
  };

  const handleEdit = async (id: string) => {
    const title = editValue.trim();
    if (!planId || !title) {
      setEditingId(null);
      return;
    }
    try {
      await api.goals.update(planId, id, { title });
      setEditingId(null);
      fetchGoals();
    } catch (e) {
      /* silently fail */
    }
  };

  const handleDelete = async (id: string) => {
    if (!planId) return;
    if (!window.confirm('Ziel wirklich löschen?')) return;
    try {
      await api.goals.delete(planId, id);
      fetchGoals();
    } catch (e) {
      /* silently fail */
    }
  };

  const getStatusBadgeStyle = (status?: string): React.CSSProperties => {
    switch (status) {
      case 'completed':
      case 'done':
        return {
          backgroundColor: `color-mix(in srgb, var(--color-success) 15%, transparent)`,
          color: 'var(--color-success)',
        };
      case 'in_progress':
      case 'active':
        return {
          backgroundColor: `color-mix(in srgb, var(--color-info) 15%, transparent)`,
          color: 'var(--color-info)',
        };
      case 'cancelled':
        return {
          backgroundColor: `color-mix(in srgb, var(--color-muted) 15%, transparent)`,
          color: 'var(--text-muted)',
        };
      default:
        return {
          backgroundColor: `color-mix(in srgb, var(--color-warning) 15%, transparent)`,
          color: 'var(--color-warning)',
        };
    }
  };

  const renderGoal = (goal: Goal, depth: number = 0) => (
    <div key={goal.id}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          paddingLeft: `calc(var(--space-3) + ${depth * 24}px)`,
          borderRadius: 'var(--radius-md)',
          transition: 'background-color var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Expand icon for goals with children */}
        {goal.children && goal.children.length > 0 ? (
          <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        ) : depth > 0 ? (
          <div style={{ width: 16, flexShrink: 0 }} />
        ) : null}

        {/* Goal content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingId === goal.id ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleEdit(goal.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEdit(goal.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              style={{
                width: '100%',
                padding: '2px var(--space-1)',
                backgroundColor: 'var(--surface-2)',
                border: 'none',
                borderBottom: '2px solid var(--color-accent-red)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--weight-medium)',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {goal.title}
              </span>

              {/* Status badge */}
              {goal.status && (
                <span
                  style={{
                    padding: '0 var(--space-2)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--weight-medium)',
                    whiteSpace: 'nowrap',
                    ...getStatusBadgeStyle(goal.status),
                  }}
                >
                  {goal.status === 'completed' || goal.status === 'done'
                    ? 'Erledigt'
                    : goal.status === 'in_progress' || goal.status === 'active'
                      ? 'In Arbeit'
                      : goal.status === 'cancelled'
                        ? 'Abgebrochen'
                        : goal.status}
                </span>
              )}

              {/* Progress badge */}
              {goal.progress != null && goal.progress > 0 && goal.progress < 100 && (
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {goal.progress}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {goal.progress != null && (
          <div style={{ width: 120 }}>
            <ProgressBar progress={goal.progress} />
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-1)',
            opacity: 0,
            transition: 'opacity var(--transition-fast)',
          }}
          className="goal-actions"
        >
          <button
            onClick={() => {
              setEditingId(goal.id);
              setEditValue(goal.title);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Bearbeiten"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => handleDelete(goal.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Löschen"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <style>{`
          div:hover > .goal-actions,
          div:hover > div > .goal-actions { opacity: 1; }
        `}</style>
      </div>

      {/* Render children */}
      {goal.children &&
        goal.children.map((child) => renderGoal(child, depth + 1))}
    </div>
  );

  if (!planId || planId === 'new') {
    return (
      <EmptyState
        icon={Target}
        title="Wählen Sie einen Plan"
        description="Erstellen oder wählen Sie einen Plan aus der Seitenleiste."
      />
    );
  }

  if (loading) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        Laden...
      </div>
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
      <div
        style={{
          backgroundColor: 'var(--surface-0)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
            }}
          >
            Ziele
          </h3>
          <button
            onClick={() => setShowNewInput(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: 'var(--space-1) var(--space-3)',
              backgroundColor: 'var(--color-accent-red)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              fontWeight: 'var(--weight-medium)',
              transition: 'opacity var(--transition-fast)',
            }}
          >
            <Plus size={16} />
            <span>Neues Goal</span>
          </button>
        </div>

        {/* New goal input */}
        {showNewInput && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex',
              gap: 'var(--space-2)',
            }}
          >
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') {
                  setShowNewInput(false);
                  setNewTitle('');
                }
              }}
              placeholder="Name des Ziels..."
              style={{
                flex: 1,
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--border-input)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleAdd}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--color-accent-red)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              Hinzufügen
            </button>
            <button
              onClick={() => {
                setShowNewInput(false);
                setNewTitle('');
              }}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-input)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
          </div>
        )}

        {/* Goal list */}
        {goals.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-8)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Keine Ziele definiert. Erstellen Sie Ihr erstes Ziel.
          </div>
        ) : (
          <div style={{ padding: 'var(--space-2) 0' }}>
            {goals.map((goal) => renderGoal(goal))}
          </div>
        )}
      </div>
    </div>
  );
}
