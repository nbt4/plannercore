import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Calendar, Users as UsersIcon, Columns3, Tags, MoreHorizontal, Trash2, Repeat } from 'lucide-react';
import { nextHighlightedIndex } from '../../lib/pickerNavigation';
import { api } from '../../services/plannerApi';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanTasks } from '../../contexts/TasksContext';
import { PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS, STYLES } from '../../lib/constants';
import PriorityBadge from '../shared/PriorityBadge';
import LabelBadge from '../shared/LabelBadge';
import ProgressBar from '../shared/ProgressBar';
import Avatar from '../shared/Avatar';
import TaskCompletionCheckbox from '../shared/TaskCompletionCheckbox';
import ChecklistSection from './ChecklistSection';
import NotesSection from './NotesSection';
import CommentsSection from './CommentsSection';
import AttachmentsSection from './AttachmentsSection';

interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
  planId: string;
  onTaskDeleted?: (taskId: string) => void;
  onTaskUpdated?: (task: any) => void;
}

const priorities = ['urgent', 'important', 'medium', 'low'];
const statuses = ['not-started', 'in-progress', 'completed'];

export default function TaskDetailPanel({ taskId, onClose, planId, onTaskDeleted, onTaskUpdated }: TaskDetailPanelProps) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [buckets, setBuckets] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [assigneeInput, setAssigneeInput] = useState('');
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<
    { userId: string; displayName: string; username: string; email?: string; avatarUrl?: string }[]
  >([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { updateTask, addAssignee: addAssigneeToContext, removeAssignee: removeAssigneeFromContext, deleteTask } = usePlanTasks();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = assigneeInput.trim();
    if (!query) {
      setAssigneeSuggestions([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      api.users
        .search(query)
        .then((users) => {
          if (cancelled) return;
          const assignedIds = new Set((task?.assignees || []).map((a: any) => a.userId));
          setAssigneeSuggestions(users.filter((u) => !assignedIds.has(u.userId)));
          setHighlightedIndex(0);
        })
        .catch(() => {
          if (!cancelled) setAssigneeSuggestions([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [assigneeInput, task?.assignees]);

  const fetchTask = useCallback(async (showLoading = true) => {
    if (!taskId) return;
    if (showLoading) setLoading(true);
    try {
      const t = await api.tasks.get(taskId);
      setTask(t);
      setTitleValue(t.title || '');
      onTaskUpdated?.(t);
    } catch (e) {
      if (showLoading) setTask(null);
    }
    if (showLoading) setLoading(false);
  }, [taskId, onTaskUpdated]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  useEffect(() => {
    setMenuOpen(false);
    setConfirmingDelete(false);
    setDeleteError(null);
  }, [taskId]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Allow the task detail panel to be dismissed without reaching for the close button.
  // Leave Escape handling to focused form controls so, for example, title editing can
  // still be cancelled without closing the whole panel.
  useEffect(() => {
    if (!taskId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [taskId, onClose]);

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
      const updated = await updateTask(taskId!, updates);
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

  const handlePriorityChange = async (priority: string) => {
    await handleUpdate({ priority });
  };

  const handleStatusChange = async (status: string) => {
    await handleUpdate({ status });
  };

  const handleBucketChange = async (bucketId: string) => {
    await handleUpdate({ bucketId: bucketId || '' });
  };

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpdate({ dueDate: e.target.value || null });
  };

  const handleRecurrenceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleUpdate({ recurrence: e.target.value });
  };

  const handleAddAssignee = async (user: {
    userId: string;
    displayName: string;
    username: string;
    email?: string;
    avatarUrl?: string;
  }) => {
    const currentAssignees = task.assignees || [];
    if (currentAssignees.some((a: any) => a.userId === user.userId)) {
      setAssigneeInput('');
      setAssigneeSuggestions([]);
      return;
    }
    try {
      await addAssigneeToContext(taskId!, user);
      setTask((prev: any) => ({
        ...prev,
        assignees: [...currentAssignees, user],
      }));
      setAssigneeInput('');
      setAssigneeSuggestions([]);
    } catch (e) {
      /* silently fail */
    }
  };

  const handleRemoveAssignee = async (userId: string) => {
    try {
      await removeAssigneeFromContext(taskId!, userId);
      setTask((prev: any) => ({
        ...prev,
        assignees: (prev.assignees || []).filter((a: any) => a.userId !== userId),
      }));
    } catch (e) {
      /* silently fail */
    }
  };

  const handleToggleLabel = async (labelId: string) => {
    const currentLabels = task.labels || [];
    const exists = currentLabels.some((l: any) => l.id === labelId);
    const updated = exists
      ? currentLabels.filter((l: any) => l.id !== labelId)
      : [...currentLabels, labels.find((l: any) => l.id === labelId)];
    await handleUpdate({ labels: updated });
  };

  const handleDeleteConfirm = async () => {
    if (!taskId) return;
    try {
      await deleteTask(taskId);
      setDeleteError(null);
      onTaskDeleted?.(taskId);
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 'var(--z-modal-overlay)',
    backgroundColor: 'var(--overlay-dark)',
    backdropFilter: 'var(--backdrop-blur-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-4)',
  };

  if (loading) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 320,
            maxWidth: '100%',
            padding: 'var(--space-6)',
            backgroundColor: STYLES.cardBg,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Laden...</span>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 320,
            maxWidth: '100%',
            padding: 'var(--space-6)',
            backgroundColor: STYLES.cardBg,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Aufgabe nicht gefunden
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 640,
          maxHeight: '85vh',
          backgroundColor: STYLES.cardBg,
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
          zIndex: 'var(--z-modal)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
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
                }}
                title="Weitere Optionen"
              >
                <MoreHorizontal size={20} />
              </button>
              {menuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 'var(--space-1)',
                    backgroundColor: 'var(--surface-1)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-dropdown)',
                    minWidth: 170,
                    zIndex: 10,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmingDelete(true);
                      setDeleteError(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-danger)',
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Aufgabe löschen</span>
                  </button>
                </div>
              )}
            </div>
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
        </div>

        {confirmingDelete && (
          <div
            style={{
              margin: 'var(--space-3) var(--space-4) 0',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-error-bg)',
              border: '1px solid var(--color-error-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
              flexShrink: 0,
            }}
          >
            <div style={{ marginBottom: 'var(--space-2)' }}>
              Diese Aufgabe endgültig löschen?
            </div>
            {deleteError && (
              <div style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: 'var(--space-1) var(--space-3)',
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
                  padding: 'var(--space-1) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
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

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 'var(--space-4)',
          }}
        >
          {/* Completion checkbox and inline-editable title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
            <div style={{ paddingTop: 'var(--space-1)' }}>
              <TaskCompletionCheckbox
                completed={task.status === 'completed'}
                taskTitle={task.title}
                onToggle={(completed) => handleUpdate({
                  status: completed ? 'completed' : 'not-started',
                })}
                size={22}
              />
            </div>
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
                flex: 1,
                minWidth: 0,
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
                flex: 1,
                minWidth: 0,
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
          </div>

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
            <div
              style={{
                marginTop: 'var(--space-1)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              Ergibt sich automatisch aus der Checkliste unten.
            </div>
          </div>

          {/* Status selector */}
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
              Status
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
              {statuses.map((s) => {
                const color = STATUS_COLORS[s];
                const isActive = task.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
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
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
              {task.isLate && (
                <span
                  style={{
                    padding: 'var(--space-1) var(--space-3)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--weight-medium)',
                    color: 'var(--color-danger)',
                    backgroundColor: 'var(--color-error-bg)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  Überfällig
                </span>
              )}
            </div>
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
                      <Avatar username={a.displayName || a.username || a.userId} avatarUrl={a.avatarUrl} size="sm" />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {a.displayName || a.username || a.userId}
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
                  <div style={{ position: 'relative' }}>
                    <input
                      value={assigneeInput}
                      onChange={(e) => setAssigneeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && assigneeSuggestions.length > 0) {
                          e.preventDefault();
                          setHighlightedIndex((i) =>
                            nextHighlightedIndex(i, assigneeSuggestions.length, 'down'),
                          );
                        } else if (e.key === 'ArrowUp' && assigneeSuggestions.length > 0) {
                          e.preventDefault();
                          setHighlightedIndex((i) =>
                            nextHighlightedIndex(i, assigneeSuggestions.length, 'up'),
                          );
                        } else if (e.key === 'Enter' && assigneeSuggestions[highlightedIndex]) {
                          e.preventDefault();
                          handleAddAssignee(assigneeSuggestions[highlightedIndex]);
                        } else if (e.key === 'Escape') {
                          setAssigneeInput('');
                          setAssigneeSuggestions([]);
                        }
                      }}
                      placeholder="+ Bearbeiter"
                      style={{
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'var(--text-muted)',
                        fontSize: 'var(--text-xs)',
                        outline: 'none',
                        width: 120,
                        padding: '2px 0',
                      }}
                    />
                    {assigneeSuggestions.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: 'var(--space-1)',
                          backgroundColor: 'var(--surface-1)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-md)',
                          boxShadow: 'var(--shadow-dropdown)',
                          minWidth: 180,
                          zIndex: 1,
                          overflow: 'hidden',
                        }}
                      >
                        {assigneeSuggestions.map((u, i) => (
                          <button
                            key={u.userId}
                            onClick={() => handleAddAssignee(u)}
                            onMouseEnter={() => setHighlightedIndex(i)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                              width: '100%',
                              padding: 'var(--space-2) var(--space-3)',
                              background: i === highlightedIndex ? 'var(--surface-2)' : 'none',
                              border: 'none',
                              color: 'var(--text-primary)',
                              fontSize: 'var(--text-sm)',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <Avatar username={u.displayName || u.username} avatarUrl={u.avatarUrl} size="sm" />
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontWeight: 600 }}>{u.displayName || u.username}</span>
                              {u.email && (
                                <span
                                  style={{
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {u.email}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                    border: '1px solid var(--border-input)',
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

            {/* Recurrence */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Repeat size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    marginBottom: '2px',
                  }}
                >
                  Wiederholung
                </div>
                <select
                  value={task.recurrence || 'none'}
                  onChange={handleRecurrenceChange}
                  style={{
                    padding: 'var(--space-1) var(--space-2)',
                    backgroundColor: 'var(--surface-2)',
                    border: '1px solid var(--border-input)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="none">Keine</option>
                  <option value="daily">Täglich</option>
                  <option value="weekly">Wöchentlich</option>
                  <option value="monthly">Monatlich</option>
                </select>
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
                    border: '1px solid var(--border-input)',
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
          <ChecklistSection taskId={taskId} onProgressChanged={() => fetchTask(false)} />
          <NotesSection taskId={taskId} initialValue={task.richTextNotes || ''} />
          <CommentsSection taskId={taskId} />
          <AttachmentsSection taskId={taskId} />

          {/* Bottom spacing */}
          <div style={{ height: 'var(--space-8)' }} />
        </div>
      </div>
    </div>
  );
}
