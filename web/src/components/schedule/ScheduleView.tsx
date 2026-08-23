import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar as RBCalendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { usePlanTasks } from '../../contexts/TasksContext';
import EmptyState from '../shared/EmptyState';
import TaskDetailPanel from '../tasks/TaskDetailPanel';
import CompletedTasksToggle from '../shared/CompletedTasksToggle';
import { completedTaskCount, tasksByCompletion } from '../../lib/taskCompletion';

const locales = { de };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

export default function ScheduleView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks } = usePlanTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const completedCount = useMemo(() => completedTaskCount(tasks), [tasks]);

  const events = useMemo(() => {
    return tasksByCompletion(tasks, showCompleted)
      .filter((t) => t.dueDate)
      .map((t) => {
        const dueDate = new Date(t.dueDate);
        return {
          id: t.id,
          title: t.title,
          start: dueDate,
          end: dueDate,
          allDay: true,
          resource: t,
        };
      });
  }, [tasks, showCompleted]);

  const handleSelectEvent = (event: any) => {
    setSelectedTaskId(event.id);
  };

  if (!planId || planId === 'new') {
    return (
      <EmptyState
        icon={CalendarIcon}
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
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <CompletedTasksToggle
            showCompleted={showCompleted}
            completedCount={completedCount}
            onChange={setShowCompleted}
          />
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            border: 'var(--border-default)',
            overflow: 'hidden',
          }}
        >
          <RBCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            defaultView={Views.MONTH}
            views={[Views.MONTH, Views.WEEK, Views.DAY]}
            onSelectEvent={handleSelectEvent}
            popup
            style={{ height: '100%' }}
            messages={{
              today: 'Heute',
              previous: 'Zurück',
              next: 'Weiter',
              month: 'Monat',
              week: 'Woche',
              day: 'Tag',
              agenda: 'Agenda',
              date: 'Datum',
              time: 'Zeit',
              event: 'Ereignis',
              showMore: (count) => `+${count} mehr`,
            }}
          />
        </div>
      </div>

      {/* CSS overrides using CSS variables */}
      <style>{`
        .rbc-calendar {
          font-family: inherit;
          background-color: var(--color-surface);
        }
        .rbc-header {
          padding: var(--space-2);
          font-size: var(--text-sm);
          font-weight: var(--weight-semibold);
          color: var(--color-text-secondary);
          border-bottom: 1px solid var(--border-subtle);
          background-color: var(--surface-1);
        }
        .rbc-header + .rbc-header {
          border-left: 1px solid var(--border-subtle);
        }
        .rbc-month-view,
        .rbc-time-view {
          border: none;
        }
        .rbc-month-view {
          background-color: var(--color-surface);
        }
        .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid var(--border-subtle);
        }
        .rbc-month-row + .rbc-month-row {
          border-top: 1px solid var(--border-subtle);
        }
        .rbc-date-cell {
          padding: var(--space-1);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }
        .rbc-today {
          background-color: color-mix(in srgb, var(--color-primary) 8%, transparent);
        }
        .rbc-off-range-bg {
          background-color: var(--surface-1);
        }
        .rbc-off-range {
          color: var(--color-muted);
        }
        .rbc-event {
          background-color: var(--color-primary);
          border-radius: var(--radius-sm);
          padding: 2px var(--space-1);
          font-size: var(--text-xs);
        }
        .rbc-event.rbc-selected {
          background-color: var(--color-primary);
        }
        .rbc-show-more {
          color: var(--color-primary);
          font-size: var(--text-xs);
        }
        .rbc-toolbar {
          margin-bottom: var(--space-3);
          padding: var(--space-2);
        }
        .rbc-toolbar button {
          color: var(--color-text-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          padding: var(--space-1) var(--space-3);
          background-color: transparent;
          transition: all var(--transition-fast);
        }
        .rbc-toolbar button:hover {
          background-color: var(--surface-2);
          color: var(--color-text-primary);
        }
        .rbc-toolbar button.rbc-active {
          background-color: var(--color-primary);
          color: #fff;
          border-color: var(--color-primary);
        }
        .rbc-toolbar-label {
          font-size: var(--text-lg);
          font-weight: var(--weight-semibold);
          color: var(--color-text-primary);
        }
        .rbc-time-gutter {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
        }
        .rbc-time-header.rbc-overflowing {
          border-right: 1px solid var(--border-subtle);
        }
        .rbc-time-content {
          border-top: 1px solid var(--border-subtle);
        }
        .rbc-time-content > * + * > * {
          border-left: 1px solid var(--border-subtle);
        }
        .rbc-timeslot-group {
          border-bottom: 1px solid var(--border-subtle);
        }
        .rbc-day-slot .rbc-time-slot {
          border-top: 1px solid var(--border-subtle);
        }
        .rbc-time-header-content {
          border-left: 1px solid var(--border-subtle);
        }
        .rbc-agenda-view {
          font-size: var(--text-sm);
        }
        .rbc-agenda-view table.rbc-agenda-table {
          border: none;
        }
        .rbc-agenda-view table.rbc-agenda-table tbody > tr > td {
          padding: var(--space-2);
          border-bottom: 1px solid var(--border-subtle);
        }
        .rbc-agenda-view table.rbc-agenda-table thead > tr > th {
          padding: var(--space-2);
          border-bottom: 1px solid var(--border-subtle);
          font-size: var(--text-xs);
          text-transform: uppercase;
          color: var(--color-text-secondary);
        }
      `}</style>

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
