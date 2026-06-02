import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { GanttChart } from 'lucide-react';
import { api } from '../../services/plannerApi';
import { PRIORITY_COLORS } from '../../lib/constants';
import PriorityBadge from '../shared/PriorityBadge';
import EmptyState from '../shared/EmptyState';
import TaskDetailPanel from '../tasks/TaskDetailPanel';

export default function TimelineView() {
  const { planId } = useParams<{ planId: string }>();
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (planId && planId !== 'new') {
      api.tasks
        .list(planId)
        .then(setTasks)
        .catch(() => setTasks([]));
    } else {
      setTasks([]);
    }
  }, [planId]);

  const { timedTasks, dateRange } = useMemo(() => {
    const withDates = tasks.filter(
      (t) => t.startDate || t.dueDate,
    );

    if (withDates.length === 0) {
      return { timedTasks: [], dateRange: null as { start: Date; end: Date } | null };
    }

    let minDate = new Date();
    let maxDate = new Date();

    withDates.forEach((t) => {
      if (t.startDate) {
        const d = new Date(t.startDate);
        if (d < minDate) minDate = d;
      }
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }
    });

    // Add padding
    minDate = new Date(minDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    maxDate = new Date(maxDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    return { timedTasks: withDates, dateRange: { start: minDate, end: maxDate } };
  }, [tasks]);

  // Generate week columns
  const weekColumns = useMemo(() => {
    if (!dateRange) return [];
    const columns: { label: string; start: Date; end: Date }[] = [];
    const cursor = new Date(dateRange.start);
    // Start at the beginning of the week (Monday)
    const dayOfWeek = cursor.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    cursor.setDate(cursor.getDate() + mondayOffset);

    while (cursor < dateRange.end) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      columns.push({
        label: `${weekStart.toLocaleDateString('de', { day: 'numeric', month: 'short' })}`,
        start: weekStart,
        end: weekEnd,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return columns;
  }, [dateRange]);

  const totalDays = useMemo(() => {
    if (!dateRange) return 1;
    return Math.max(
      1,
      Math.ceil(
        (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
  }, [dateRange]);

  const getBarStyle = (task: any) => {
    if (!dateRange) return {};
    const startDate = task.startDate
      ? new Date(task.startDate)
      : task.dueDate
        ? new Date(task.dueDate)
        : new Date();
    const endDate = task.dueDate ? new Date(task.dueDate) : startDate;

    const totalMs = dateRange.end.getTime() - dateRange.start.getTime();
    const leftMs = startDate.getTime() - dateRange.start.getTime();
    const durationMs = Math.max(endDate.getTime() - startDate.getTime(), 24 * 60 * 60 * 1000);

    const leftPct = Math.max(0, (leftMs / totalMs) * 100);
    const widthPct = Math.min(100 - leftPct, (durationMs / totalMs) * 100);

    return { left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` };
  };

  const getTaskColor = (task: any) => {
    if (task.priority && PRIORITY_COLORS[task.priority]) {
      return PRIORITY_COLORS[task.priority];
    }
    // Color by bucket
    const hue = task.bucketId
      ? task.bucketId.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) * 37 % 360
      : 210;
    return `hsl(${hue}, 55%, 50%)`;
  };

  if (!planId || planId === 'new') {
    return (
      <EmptyState
        icon={GanttChart}
        title="Wählen Sie einen Plan"
        description="Erstellen oder wählen Sie einen Plan aus der Seitenleiste."
      />
    );
  }

  if (timedTasks.length === 0) {
    return (
      <EmptyState
        icon={GanttChart}
        title="Keine Zeitachsendaten"
        description="Weisen Sie Aufgaben Start- und Enddaten zu, um sie in der Zeitachse anzuzeigen."
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
            minWidth: 600,
            backgroundColor: 'var(--surface-0)',
            borderRadius: 'var(--radius-lg)',
            border: 'var(--border-default)',
            overflow: 'hidden',
          }}
        >
          {/* Timeline header */}
          <div
            style={{
              display: 'flex',
              borderBottom: 'var(--border-default)',
            }}
          >
            {/* Task names column */}
            <div
              style={{
                width: 240,
                flexShrink: 0,
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                borderRight: 'var(--border-default)',
              }}
            >
              Aufgaben
            </div>
            {/* Week columns header */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              {weekColumns.map((col, idx) => (
                <div
                  key={idx}
                  style={{
                    flex: `${7 / totalDays * weekColumns.length}`,
                    padding: 'var(--space-2) var(--space-1)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--weight-medium)',
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    borderRight:
                      idx < weekColumns.length - 1
                        ? 'var(--border-subtle)'
                        : 'none',
                    backgroundColor: 'var(--surface-1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                </div>
              ))}
            </div>
          </div>

          {/* Task rows */}
          {timedTasks.map((task, taskIdx) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                borderBottom: 'var(--border-subtle)',
                backgroundColor:
                  taskIdx % 2 === 0 ? 'transparent' : 'var(--surface-1)',
                cursor: 'pointer',
                transition: 'background-color var(--transition-fast)',
              }}
              onClick={() => setSelectedTaskId(task.id)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  taskIdx % 2 === 0 ? 'transparent' : 'var(--surface-1)';
              }}
            >
              {/* Task name cell */}
              <div
                style={{
                  width: 240,
                  flexShrink: 0,
                  padding: 'var(--space-2) var(--space-3)',
                  borderRight: 'var(--border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {task.title}
                </span>
                {task.priority && <PriorityBadge priority={task.priority} />}
              </div>

              {/* Timeline bar area */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  height: 40,
                  overflow: 'hidden',
                }}
              >
                {/* Week grid lines */}
                {weekColumns.map((col, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: `${(idx / weekColumns.length) * 100}%`,
                      width: `${(1 / weekColumns.length) * 100}%`,
                      height: '100%',
                      borderRight:
                        idx < weekColumns.length - 1
                          ? '1px solid var(--border-subtle)'
                          : 'none',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {/* Task bar */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: 24,
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: getTaskColor(task),
                    opacity: 0.85,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 var(--space-2)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'opacity var(--transition-fast)',
                    ...getBarStyle(task),
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: '#fff',
                      fontWeight: 'var(--weight-medium)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                    }}
                  >
                    {task.title}
                  </span>
                </div>
              </div>
            </div>
          ))}
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
