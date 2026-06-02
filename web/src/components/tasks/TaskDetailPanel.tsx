import { useState, useEffect, useCallback } from 'react';
import { X, Calendar, Users as UsersIcon, Columns3, Tags } from 'lucide-react';
import { api } from '../../services/plannerApi';
import { useAuth } from '../../contexts/AuthContext';
import { PRIORITY_COLORS, STYLES } from '../../lib/constants';
import PriorityBadge from '../shared/PriorityBadge';
import LabelBadge from '../shared/LabelBadge';
import ProgressBar from '../shared/ProgressBar';
import Avatar from '../shared/Avatar';
import ChecklistSection from './ChecklistSection';
import NotesSection from './NotesSection';
import CommentsSection from './CommentsSection';
import AttachmentsSection from './AttachmentsSection';

interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
  planId: string;
}

const priorities = ['urgent', 'important', 'medium', 'low'];

export default function TaskDetailPanel({ taskId, onClose, planId }: TaskDetailPanelProps) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [buckets, setBuckets] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [assigneeInput, setAssigneeInput] = useState('');

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const t = await api.tasks.get(taskId);
      setTask(t);
      setTitleValue(t.title || '');
    } catch (e) {
      setTask(null);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Load buckets and labels
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.buckets.list(planId).then(setBuckets).catch(() => {});
      api.labels.list(planId).then(setLabels).catch(() => {});
    }
  }, [planId]);

  if (!taskId) return null;

  const handleUpdate = async (updates: any) => {
    try {
      const updated = await api.tasks.update(taskId, updates);
      setTask((prev: any) => ({ ...prev, ...updated }));
    } catch (e) {
      /* silently fail */
    }
  };

  const handleSaveTitle = async () => {
    const val = titleValue.trim();
    if (!val) {
      setTitleValue(task.title);
    } else if (val !== task.title) {
      await handleUpdate({ title: val });
    }
    setEditingTitle(false);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setTask((prev: any) => ({ ...prev, progress: val }));
    handleUpdate({ progress: val });
  };

  const handlePriorityChange = async (priority: string) => {
    await handleUpdate({ priority });
  };

  const handleBucketChange = async (bucketId: string) => {
    await handleUpdate({ bucketId: bucketId || '' });
  };

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpdate({ dueDate: e.target.value || null });
  };

  const handleAddAssignee = async () => {
    const username = assigneeInput.trim();
    if (!username) return;
    try {
      // Add assignee by username - the API takes an array of assignee IDs
      const currentAssignees = task.assignees || [];
      if (currentAssignees.some((a: any) => a.username === username || a.userId === username)) {
        setAssigneeInput('');
        return;
      }
      const updatedAssignees = [...currentAssignees, { userId: username, username }];
      await handleUpdate({ assignees: updatedAssignees });
      setAssigneeInput('');
    } catch (e) {
      /* silently fail */
    }
  };

  const handleRemoveAssignee = async (userId: string) => {
    const updated = (task.assignees || []).filter((a: any) => a.userId !== userId);
    await handleUpdate({ assignees: updated });
  };

  const handleToggleLabel = async (labelId: string) => {
    const currentLabels = task.labels || [];
    const exists = currentLabels.some((l: any) => l.id === labelId);
    const updated = exists
      ? currentLabels.filter((l: any) => l.id !== labelId)
      : [...currentLabels, labels.find((l: any) => l.id === labelId)];
    await handleUpdate({ labels: updated });
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          backgroundColor: STYLES.cardBg,
          borderLeft: 'var(--border-default)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Laden...</span>
      </div>
    );
  }

  if (!task) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          backgroundColor: STYLES.cardBg,
          borderLeft: 'var(--border-default)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          Aufgabe nicht gefunden
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 49,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          backgroundColor: STYLES.cardBg,
          borderLeft: 'var(--border-default)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: 'var(--border-default)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-secondary)',
            }}
          >
            Aufgabendetails
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--space-1)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color var(--transition-fast)',
            }}
            title="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 'var(--space-4)',
          }}
        >
          {/* Title (inline editable) */}
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setTitleValue(task.title);
                  setEditingTitle(false);
                }
              }}
              style={{
                width: '100%',
                padding: 'var(--space-1) var(--space-2)',
                backgroundColor: 'var(--surface-2)',
                border: 'none',
                borderBottom: '2px solid var(--color-accent-red)',
                borderRadius: 0,
                color: 'var(--text-primary)',
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--weight-semibold)',
                outline: 'none',
                marginBottom: 'var(--space-3)',
              }}
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              style={{
                margin: '0 0 var(--space-3)',
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)',
                cursor: 'text',
                lineHeight: 'var(--leading-snug)',
              }}
            >
              {task.title}
            </h2>
          )}

          {/* Progress bar with slider */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-1)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  fontWeight: 'var(--weight-medium)',
                }}
              >
                Fortschritt
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                }}
              >
                {task.progress ?? 0}%
              </span>
            </div>
            <ProgressBar progress={task.progress ?? 0} />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={task.progress ?? 0}
              onChange={handleProgressChange}
              style={{
                width: '100%',
                marginTop: 'var(--space-1)',
                accentColor: 'var(--color-accent-red)',
                height: 4,
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Priority selector */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                fontWeight: 'var(--weight-medium)',
                display: 'block',
                marginBottom: 'var(--space-1)',
              }}
            >
              Priorität
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {priorities.map((p) => {
                const color = PRIORITY_COLORS[p] || 'var(--text-muted)';
                const isActive = task.priority === p;
                return (
                  <button
                    key={p}
                    onClick={() => handlePriorityChange(p)}
                    style={{
                      padding: 'var(--space-1) var(--space-3)',
                      borderRadius: 'var(--radius-full)',
                      border: isActive
                        ? `2px solid ${color}`
                        : '2px solid var(--border-subtle)',
                      backgroundColor: isActive
                        ? `color-mix(in srgb, ${color} 15%, transparent)`
                        : 'transparent',
                      color: isActive ? color : 'var(--text-secondary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--weight-medium)',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metadata row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            {/* Assignees */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <UsersIcon size={16} style={{ color: 'var(--text-muted)', marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Bearbeiter
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                  {(task.assignees || []).map((a: any) => (
                    <span
                      key={a.userId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        padding: '1px var(--space-2)',
                        backgroundColor: 'var(--surface-2)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <Avatar username={a.username || a.userId} size="sm" />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {a.username || a.userId}
                      </span>
                      <button
                        onClick={() => handleRemoveAssignee(a.userId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          padding: 0,
                          display: 'flex',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={assigneeInput}
                    onChange={(e) => setAssigneeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddAssignee();
                      }
                    }}
                    placeholder="+ Bearbeiter"
                    style={{
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-xs)',
                      outline: 'none',
                      width: 100,
                      padding: '2px 0',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Due date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Calendar size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    marginBottom: '2px',
                  }}
                >
                  Fällig am
                </div>
                <input
                  type="date"
                  value={task.dueDate ? task.dueDate.split('T')[0] : ''}
                  onChange={handleDueDateChange}
                  style={{
                    padding: 'var(--space-1) var(--space-2)',
                    backgroundColor: 'var(--surface-2)',
                    border: 'var(--border-input)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Bucket selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Columns3 size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    marginBottom: '2px',
                  }}
                >
                  Spalte
                </div>
                <select
                  value={task.bucketId || ''}
                  onChange={(e) => handleBucketChange(e.target.value)}
                  style={{
                    padding: 'var(--space-1) var(--space-2)',
                    backgroundColor: 'var(--surface-2)',
                    border: 'var(--border-input)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Keine Spalte</option>
                  {buckets.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Labels */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <Tags size={16} style={{ color: 'var(--text-muted)', marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  Labels
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                  {labels.map((label: any) => {
                    const isActive = (task.labels || []).some((l: any) => l.id === label.id);
                    return (
                      <button
                        key={label.id}
                        onClick={() => handleToggleLabel(label.id)}
                        style={{
                          padding: '1px var(--space-2)',
                          borderRadius: 'var(--radius-full)',
                          border: isActive
                            ? `2px solid ${label.color}`
                            : '2px solid var(--border-subtle)',
                          backgroundColor: isActive
                            ? `color-mix(in srgb, ${label.color} 15%, transparent)`
                            : 'transparent',
                          color: isActive ? label.color : 'var(--text-muted)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                        }}
                      >
                        {label.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Divider before sections */}
          <div
            style={{
              height: 1,
              backgroundColor: 'var(--border-divider)',
              margin: 'var(--space-2) 0',
            }}
          />

          {/* Sub-components */}
          <ChecklistSection taskId={taskId} />
          <NotesSection taskId={taskId} initialValue={task.richTextNotes || ''} />
          <CommentsSection taskId={taskId} />
          <AttachmentsSection taskId={taskId} />

          {/* Bottom spacing */}
          <div style={{ height: 'var(--space-8)' }} />
        </div>
      </div>
    </>
  );
}
