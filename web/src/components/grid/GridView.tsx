import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid } from 'lucide-react';
import { api } from '../../services/plannerApi';
import { PRIORITY_COLORS } from '../../lib/constants';
import PriorityBadge from '../shared/PriorityBadge';
import LabelBadge from '../shared/LabelBadge';
import ProgressBar from '../shared/ProgressBar';
import Avatar from '../shared/Avatar';
import EmptyState from '../shared/EmptyState';
import TaskDetailPanel from '../tasks/TaskDetailPanel';

type SortField = 'title' | 'priority' | 'dueDate' | 'progress' | 'bucket';
type SortDir = 'asc' | 'desc';

export default function GridView() {
  const { planId } = useParams<{ planId: string }>();
  const [tasks, setTasks] = useState<any[]>([]);
  const [buckets, setBuckets] = useState<any[]>([]);
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (planId && planId !== 'new') {
      api.tasks.list(planId).then(setTasks).catch(() => setTasks([]));
      api.buckets.list(planId).then(setBuckets).catch(() => setBuckets([]));
    } else {
      setTasks([]);
      setBuckets([]);
    }
  }, [planId]);

  const bucketMap = useMemo(() => {
    const map: Record<string, string> = {};
    buckets.forEach((b: any) => { map[b.id] = b.name; });
    return map;
  }, [buckets]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '');
          break;
        case 'priority': {
          const order = ['urgent', 'important', 'medium', 'low', ''];
          cmp = order.indexOf(a.priority) - order.indexOf(b.priority);
          break;
        }
        case 'dueDate': {
          if (!a.dueDate && !b.dueDate) cmp = 0;
          else if (!a.dueDate) cmp = 1;
          else if (!b.dueDate) cmp = -1;
          else cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        }
        case 'progress':
          cmp = (a.progress ?? 0) - (b.progress ?? 0);
          break;
        case 'bucket':
          cmp = (bucketMap[a.bucketId] || '').localeCompare(bucketMap[b.bucketId] || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tasks, sortField, sortDir, bucketMap]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => {
    const active = sortField === field;
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th
        onClick={() => handleSort(field)}
        style={{
          padding: 'var(--space-2) var(--space-3)',
          textAlign: 'left',
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-semibold)',
          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
          borderBottom: 'var(--border-default)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--surface-0)',
          zIndex: 1,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          {label}
          <Icon size={14} style={{ opacity: active ? 1 : 0.4 }} />
        </span>
      </th>
    );
  };

  if (!planId || planId === 'new') {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Wählen Sie einen Plan"
        description="Erstellen oder wählen Sie einen Plan aus der Seitenleiste."
      />
    );
  }

  return (
    <>
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
            border: 'var(--border-default)',
            overflow: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <SortHeader field="title" label="Aufgabe" />
                <SortHeader field="bucket" label="Spalte" />
                <SortHeader field="priority" label="Priorität" />
                <th
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wide)',
                    borderBottom: 'var(--border-default)',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'var(--surface-0)',
                    zIndex: 1,
                  }}
                >
                  Bearbeiter
                </th>
                <SortHeader field="dueDate" label="Fällig am" />
                <SortHeader field="progress" label="Fortschritt" />
                <th
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    textAlign: 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wide)',
                    borderBottom: 'var(--border-default)',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'var(--surface-0)',
                    zIndex: 1,
                  }}
                >
                  Labels
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 'var(--space-8)',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    Keine Aufgaben in diesem Plan
                  </td>
                </tr>
              )}
              {sortedTasks.map((task, idx) => (
                <tr
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  style={{
                    cursor: 'pointer',
                    transition: 'background-color var(--transition-fast)',
                    backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface-1)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-2)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      idx % 2 === 0 ? 'transparent' : 'var(--surface-1)';
                  }}
                >
                  <td
                    style={{
                      padding: 'var(--space-3)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-primary)',
                      fontWeight: 'var(--weight-medium)',
                      borderBottom: 'var(--border-subtle)',
                      maxWidth: 250,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.title}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-3)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-secondary)',
                      borderBottom: 'var(--border-subtle)',
                    }}
                  >
                    {bucketMap[task.bucketId] || '-'}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-3)',
                      borderBottom: 'var(--border-subtle)',
                    }}
                  >
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-3)',
                      borderBottom: 'var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {(task.assignees || []).slice(0, 3).map((a: any, i: number, arr: any[]) => (
                        <div
                          key={a.userId}
                          style={{
                            marginLeft: i > 0 ? '-6px' : 0,
                            zIndex: arr.length - i,
                          }}
                        >
                          <Avatar username={a.username || a.userId} size="sm" />
                        </div>
                      ))}
                      {(task.assignees || []).length > 3 && (
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
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-3)',
                      fontSize: 'var(--text-sm)',
                      color: task.dueDate
                        ? new Date(task.dueDate) < new Date()
                          ? 'var(--color-error)'
                          : 'var(--text-secondary)'
                        : 'var(--text-muted)',
                      borderBottom: 'var(--border-subtle)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString()
                      : '-'}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-3)',
                      borderBottom: 'var(--border-subtle)',
                      width: 150,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <ProgressBar progress={task.progress ?? 0} />
                      </div>
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {task.progress ?? 0}%
                      </span>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-3)',
                      borderBottom: 'var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                      {(task.labels || []).map((label: any) => (
                        <LabelBadge
                          key={label.id}
                          name={label.name}
                          color={label.color}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          planId={planId}
        />
      )}
    </>
  );
}
