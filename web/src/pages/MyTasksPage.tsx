import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Calendar } from 'lucide-react';
import { api } from '../services/plannerApi';
import PriorityBadge from '../components/shared/PriorityBadge';
import LabelBadge from '../components/shared/LabelBadge';
import ProgressBar from '../components/shared/ProgressBar';
import EmptyState from '../components/shared/EmptyState';

interface MyTask {
  id: string;
  title: string;
  planId?: string;
  planName?: string;
  dueDate?: string;
  priority?: string;
  labels?: { id: string; name: string; color: string }[];
  progress?: number;
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.my
      .tasks()
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        Laden...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <EmptyState
          icon={() => (
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--text-muted)', opacity: 0.5 }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          title="Keine offenen Aufgaben"
          description="Alle deine Aufgaben sind erledigt. Gut gemacht!"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 'var(--space-6)',
        maxWidth: 720,
        margin: '0 auto',
        height: '100vh',
        overflow: 'auto',
      }}
    >
      <h1
        style={{
          margin: '0 0 var(--space-1)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 'var(--weight-bold)',
          color: 'var(--text-primary)',
        }}
      >
        Meine Aufgaben
      </h1>
      <p
        style={{
          margin: '0 0 var(--space-4)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
        }}
      >
        {tasks.length} Aufgabe{tasks.length !== 1 ? 'n' : ''} offen
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => {
              if (task.planId) {
                navigate(`/plan/${task.planId}/board`);
              }
            }}
            style={{
              backgroundColor: 'var(--surface-0)',
              borderRadius: 'var(--radius-lg)',
              border: 'var(--border-default)',
              padding: 'var(--space-3) var(--space-4)',
              cursor: task.planId ? 'pointer' : 'default',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  style={{
                    margin: '0 0 var(--space-1)',
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.title}
                </h3>

                {/* Plan name */}
                {task.planName && (
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      display: 'block',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    {task.planName}
                  </span>
                )}

                {/* Labels and priority */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--space-1)',
                    alignItems: 'center',
                  }}
                >
                  {task.priority && <PriorityBadge priority={task.priority} />}
                  {(task.labels || []).map((label) => (
                    <LabelBadge
                      key={label.id}
                      name={label.name}
                      color={label.color}
                    />
                  ))}
                </div>
              </div>

              {/* Due date and progress */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 'var(--space-2)',
                  flexShrink: 0,
                }}
              >
                {task.dueDate && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: 'var(--text-xs)',
                      color:
                        new Date(task.dueDate) < new Date()
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
          </div>
        ))}
      </div>
    </div>
  );
}
