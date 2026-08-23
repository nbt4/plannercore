import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ClipboardList } from 'lucide-react';
import { api } from '../services/plannerApi';
import PriorityBadge from '../components/shared/PriorityBadge';
import LabelBadge from '../components/shared/LabelBadge';
import ProgressBar from '../components/shared/ProgressBar';
import EmptyState from '../components/shared/EmptyState';
import CreateTaskQuickAdd from '../components/tasks/CreateTaskQuickAdd';
import TaskCompletionCheckbox from '../components/shared/TaskCompletionCheckbox';
import CompletedTasksToggle from '../components/shared/CompletedTasksToggle';
import { completedTaskCount, isTaskCompleted, tasksByCompletion } from '../lib/taskCompletion';

interface MyTask {
  id: string;
  title: string;
  planId?: string;
  planName?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  completedAt?: string | null;
  labels?: { id: string; name: string; color: string }[];
  progress?: number;
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.my
      .tasks(true)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const visibleTasks = useMemo(
    () => tasksByCompletion(tasks, showCompleted),
    [tasks, showCompleted],
  );
  const completedCount = useMemo(() => completedTaskCount(tasks), [tasks]);
  const openCount = tasks.length - completedCount;

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    const updated = await api.tasks.update(taskId, {
      status: completed ? 'completed' : 'not-started',
    });
    setTasks((current) => current.map((task) => (
      task.id === taskId ? { ...task, ...updated } : task
    )));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Laden...
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 720, margin: '0 auto', height: '100vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ margin: '0 0 var(--space-1)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>
            Meine Aufgaben
          </h1>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {openCount} Aufgabe{openCount !== 1 ? 'n' : ''} offen
          </p>
        </div>
        <CreateTaskQuickAdd
          assignToCurrentUser
          onCreated={(task) => setTasks((current) => [...current, task])}
        />
      </div>

      <div style={{ margin: 'var(--space-4) 0' }}>
        <CompletedTasksToggle
          showCompleted={showCompleted}
          completedCount={completedCount}
          onChange={setShowCompleted}
        />
      </div>

      {visibleTasks.length === 0 ? (
        <div style={{ padding: 'var(--space-8) 0' }}>
          <EmptyState
            icon={ClipboardList}
            title={tasks.length === 0 ? 'Keine Aufgaben' : 'Keine offenen Aufgaben'}
            description={tasks.length === 0
              ? 'Erstelle eine Aufgabe und weise sie dir selbst zu.'
              : 'Alle deine Aufgaben sind abgeschlossen. Über den Schalter oben kannst du sie wieder anzeigen.'}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {visibleTasks.map((task) => {
            const completed = isTaskCompleted(task);
            return (
              <div
                key={task.id}
                onClick={() => {
                  if (task.planId) navigate(`/plan/${task.planId}/board`);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                  backgroundColor: 'var(--surface-0)',
                  borderRadius: 'var(--radius-lg)',
                  border: 'var(--border-default)',
                  padding: 'var(--space-3) var(--space-4)',
                  cursor: task.planId ? 'pointer' : 'default',
                  transition: 'all var(--transition-fast)',
                  opacity: completed ? 0.72 : 1,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = 'var(--border-strong)';
                  event.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = 'var(--border-default)';
                  event.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ paddingTop: 2 }}>
                  <TaskCompletionCheckbox
                    completed={completed}
                    taskTitle={task.title}
                    onToggle={(nextCompleted) => handleToggleComplete(task.id, nextCompleted)}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      margin: '0 0 var(--space-1)',
                      fontSize: 'var(--text-base)',
                      fontWeight: 'var(--weight-semibold)',
                      color: completed ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: completed ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.title}
                  </h3>
                  {task.planName && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--space-2)' }}>
                      {task.planName}
                    </span>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', alignItems: 'center' }}>
                    {task.priority && <PriorityBadge priority={task.priority} />}
                    {(task.labels || []).map((label) => (
                      <LabelBadge key={label.id} name={label.name} color={label.color} />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)', flexShrink: 0 }}>
                  {task.dueDate && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        fontSize: 'var(--text-xs)',
                        color: !completed && new Date(task.dueDate) < new Date()
                          ? 'var(--color-error)'
                          : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Calendar size={12} />
                      {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {task.progress != null && task.progress > 0 && (
                    <div style={{ width: 100 }}>
                      <ProgressBar progress={task.progress} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
