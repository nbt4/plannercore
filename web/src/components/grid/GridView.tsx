import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid } from 'lucide-react';
import { api } from '../../services/plannerApi';
import { usePlanTasks } from '../../contexts/TasksContext';
import { PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from '../../lib/constants';
import {
  EMPTY_FILTERS,
  assigneeOptionsFromTasks,
  filterTasks,
  type TaskFilters,
} from '../../lib/taskFilters';
import PriorityBadge from '../shared/PriorityBadge';
import LabelBadge from '../shared/LabelBadge';
import ProgressBar from '../shared/ProgressBar';
import Avatar from '../shared/Avatar';
import EmptyState from '../shared/EmptyState';
import FilterBar from '../shared/FilterBar';
import TaskDetailPanel from '../tasks/TaskDetailPanel';
import TaskCompletionCheckbox from '../shared/TaskCompletionCheckbox';
import CompletedTasksToggle from '../shared/CompletedTasksToggle';
import { completedTaskCount, tasksByCompletion } from '../../lib/taskCompletion';

type SortField = 'title' | 'priority' | 'dueDate' | 'progress' | 'bucket';
type SortDir = 'asc' | 'desc';
type GroupBy = 'none' | 'bucket' | 'assignee' | 'priority' | 'status' | 'label';
const COLUMN_COUNT = 9;

export default function GridView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks, buckets, updateTask } = usePlanTasks();
  const [labels, setLabels] = useState<any[]>([]);
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Labels aren't part of live-sync yet — kept as GridView's own fetch.
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.labels.list(planId).then(setLabels).catch(() => setLabels([]));
    } else {
      setLabels([]);
    }
  }, [planId]);

  const bucketMap = useMemo(() => {
    const map: Record<string, string> = {};
    buckets.forEach((b: any) => { map[b.id] = b.name; });
    return map;
  }, [buckets]);

  const assigneeOptions = useMemo(() => assigneeOptionsFromTasks(tasks), [tasks]);
  const completionFilteredTasks = useMemo(
    () => tasksByCompletion(tasks, showCompleted),
    [tasks, showCompleted],
  );
  const filteredTasks = useMemo(
    () => filterTasks(completionFilteredTasks, filters),
    [completionFilteredTasks, filters],
  );
  const completedCount = useMemo(() => completedTaskCount(tasks), [tasks]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
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
  }, [filteredTasks, sortField, sortDir, bucketMap]);

  // When grouping is active, a task can land in more than one group (e.g.
  // grouping by label when it has several), so groups are built independently
  // of the flat sortedTasks array rather than partitioning it.
  const groups = useMemo(() => {
    if (groupBy === 'none') return null;
    const order: string[] = [];
    const map = new Map<string, { label: string; tasks: any[] }>();
    const addTo = (key: string, label: string, task: any) => {
      if (!map.has(key)) {
        map.set(key, { label, tasks: [] });
        order.push(key);
      }
      map.get(key)!.tasks.push(task);
    };
    sortedTasks.forEach((task) => {
      switch (groupBy) {
        case 'bucket':
          addTo(task.bucketId || '__none__', bucketMap[task.bucketId] || 'Keine Spalte', task);
          break;
        case 'assignee':
          if ((task.assignees || []).length === 0) {
            addTo('__none__', 'Nicht zugewiesen', task);
          } else {
            task.assignees.forEach((a: any) => addTo(a.userId, a.displayName || a.username || a.userId, task));
          }
          break;
        case 'priority':
          addTo(task.priority || '__none__', task.priority || 'Keine Priorität', task);
          break;
        case 'status':
          addTo(task.status || 'not-started', STATUS_LABELS[task.status] || task.status, task);
          break;
        case 'label':
          if ((task.labels || []).length === 0) {
            addTo('__none__', 'Kein Label', task);
          } else {
            task.labels.forEach((l: any) => addTo(l.id, l.name, task));
          }
          break;
      }
    });
    return order.map((key) => map.get(key)!);
  }, [sortedTasks, groupBy, bucketMap]);

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

  const PlainHeader = ({ label }: { label: string }) => (
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
      {label}
    </th>
  );

  const renderRow = (task: any, idx: number) => (
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
      <td style={{ padding: 'var(--space-3)', borderBottom: 'var(--border-subtle)', width: 36 }}>
        <TaskCompletionCheckbox
          completed={task.status === 'completed'}
          taskTitle={task.title}
          onToggle={(completed) => updateTask(task.id, {
            status: completed ? 'completed' : 'not-started',
          })}
        />
      </td>
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
      <td style={{ padding: 'var(--space-3)', borderBottom: 'var(--border-subtle)' }}>
        {task.status && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              fontSize: 'var(--text-xs)',
              color: STATUS_COLORS[task.status] || 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: STATUS_COLORS[task.status] || 'var(--text-muted)',
                flexShrink: 0,
              }}
            />
            {STATUS_LABELS[task.status] || task.status}
          </span>
        )}
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
      <td style={{ padding: 'var(--space-3)', borderBottom: 'var(--border-subtle)' }}>
        <PriorityBadge priority={task.priority} />
      </td>
      <td style={{ padding: 'var(--space-3)', borderBottom: 'var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {(task.assignees || []).slice(0, 3).map((a: any, i: number, arr: any[]) => (
            <div
              key={a.userId}
              style={{
                marginLeft: i > 0 ? '-6px' : 0,
                zIndex: arr.length - i,
              }}
            >
              <Avatar username={a.displayName || a.username || a.userId} avatarUrl={a.avatarUrl} size="sm" />
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
          color: task.isLate ? 'var(--color-error)' : 'var(--text-secondary)',
          fontWeight: task.isLate ? 'var(--weight-medium)' : 'var(--weight-normal)',
          borderBottom: 'var(--border-subtle)',
          whiteSpace: 'nowrap',
        }}
      >
        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}
      </td>
      <td
        style={{
          padding: 'var(--space-3)',
          borderBottom: 'var(--border-subtle)',
          width: 150,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ flex: 1 }}>
            <ProgressBar progress={task.progress ?? 0} />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {task.progress ?? 0}%
          </span>
        </div>
      </td>
      <td style={{ padding: 'var(--space-3)', borderBottom: 'var(--border-subtle)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {(task.labels || []).map((label: any) => (
            <LabelBadge key={label.id} name={label.name} color={label.color} />
          ))}
        </div>
      </td>
    </tr>
  );

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
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            alignItems: 'center',
            marginBottom: 'var(--space-1)',
          }}
        >
          <FilterBar
            filters={filters}
            onChange={setFilters}
            buckets={buckets}
            labels={labels}
            assignees={assigneeOptions}
          />
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <CompletedTasksToggle
              showCompleted={showCompleted}
              completedCount={completedCount}
              onChange={setShowCompleted}
            />
          </div>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            style={{
              padding: 'var(--space-1) var(--space-2)',
              backgroundColor: 'var(--surface-1)',
              border: 'var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-xs)',
              outline: 'none',
              cursor: 'pointer',
              marginBottom: 'var(--space-3)',
            }}
          >
            <option value="none">Nicht gruppieren</option>
            <option value="bucket">Nach Spalte gruppieren</option>
            <option value="assignee">Nach Bearbeiter gruppieren</option>
            <option value="priority">Nach Priorität gruppieren</option>
            <option value="status">Nach Status gruppieren</option>
            <option value="label">Nach Label gruppieren</option>
          </select>
        </div>
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
                <PlainHeader label="Erledigt" />
                <SortHeader field="title" label="Aufgabe" />
                <PlainHeader label="Status" />
                <SortHeader field="bucket" label="Spalte" />
                <SortHeader field="priority" label="Priorität" />
                <PlainHeader label="Bearbeiter" />
                <SortHeader field="dueDate" label="Fällig am" />
                <SortHeader field="progress" label="Fortschritt" />
                <PlainHeader label="Labels" />
              </tr>
            </thead>
            <tbody>
              {sortedTasks.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMN_COUNT}
                    style={{
                      padding: 'var(--space-8)',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    Keine Aufgaben gefunden
                  </td>
                </tr>
              )}
              {groups
                ? groups.map((group) => (
                    <Fragment key={group.label}>
                      <tr>
                        <td
                          colSpan={COLUMN_COUNT}
                          style={{
                            padding: 'var(--space-2) var(--space-3)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 'var(--weight-semibold)',
                            color: 'var(--text-secondary)',
                            backgroundColor: 'var(--surface-1)',
                            borderBottom: 'var(--border-default)',
                          }}
                        >
                          {group.label} ({group.tasks.length})
                        </td>
                      </tr>
                      {group.tasks.map((task, idx) => renderRow(task, idx))}
                    </Fragment>
                  ))
                : sortedTasks.map((task, idx) => renderRow(task, idx))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          planId={planId}
          onTaskDeleted={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
}
