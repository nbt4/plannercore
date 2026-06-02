import { useState, useEffect } from 'react';
import { Sun, Plus, CheckCircle2, Circle, Search } from 'lucide-react';
import { api } from '../services/plannerApi';
import EmptyState from '../components/shared/EmptyState';

interface DayTask {
  id: string;
  title: string;
  planId?: string;
  planName?: string;
  dueDate?: string;
  completed?: boolean;
}

interface GroupedTasks {
  planName: string;
  tasks: DayTask[];
}

export default function MyDayPage() {
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddInput, setShowAddInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const fetchDay = async () => {
    setLoading(true);
    try {
      const data = await api.my.day();
      setTasks(data || []);
    } catch (e) {
      setTasks([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDay();
  }, []);

  const groupedTasks: GroupedTasks[] = (() => {
    const map: Record<string, DayTask[]> = {};
    tasks.forEach((t) => {
      const key = t.planName || 'Ohne Plan';
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return Object.entries(map).map(([planName, planTasks]) => ({
      planName,
      tasks: planTasks,
    }));
  })();

  const handleToggleComplete = async (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t,
      ),
    );
    try {
      await api.tasks.update(taskId, {
        progress: tasks.find((t) => t.id === taskId)?.completed ? 0 : 100,
      });
    } catch (e) {
      /* revert */
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, completed: !t.completed } : t,
        ),
      );
    }
  };

  const handleRemoveFromDay = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await api.my.removeDay(taskId);
    } catch (e) {
      fetchDay();
    }
  };

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      // Search through my tasks
      const myTasks = await api.my.tasks();
      const filtered = myTasks.filter(
        (t: any) =>
          t.title.toLowerCase().includes(value.toLowerCase()) &&
          !tasks.some((dt) => dt.id === t.id),
      );
      setSearchResults(filtered.slice(0, 5));
    } catch (e) {
      setSearchResults([]);
    }
  };

  const handleAddToDay = async (task: any) => {
    try {
      await api.my.addDay(task.id);
      setTasks((prev) => [
        ...prev,
        {
          id: task.id,
          title: task.title,
          planId: task.planId,
          planName: task.planName,
          dueDate: task.dueDate,
          completed: task.progress === 100,
        },
      ]);
      setSearchQuery('');
      setSearchResults([]);
      setShowAddInput(false);
    } catch (e) {
      /* silently fail */
    }
  };

  const today = new Date().toLocaleDateString('de', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

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

  if (tasks.length === 0 && !showAddInput) {
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
          icon={Sun}
          title="Dein Tag ist noch leer"
          description="Füge Aufgaben hinzu, um dich auf das Wesentliche zu konzentrieren."
          action={
            <button
              onClick={() => setShowAddInput(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--color-accent-red)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                fontWeight: 'var(--weight-medium)',
              }}
            >
              <Plus size={18} />
              <span>Aufgabe hinzufügen</span>
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 'var(--space-6)',
        maxWidth: 640,
        margin: '0 auto',
        height: '100vh',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-1)',
        }}
      >
        <Sun
          size={28}
          style={{ color: 'var(--color-warning)', flexShrink: 0 }}
        />
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--weight-bold)',
              color: 'var(--text-primary)',
            }}
          >
            Mein Tag
          </h1>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
            }}
          >
            {today}
          </p>
        </div>
      </div>

      {/* Task count */}
      <p
        style={{
          margin: 'var(--space-3) 0 var(--space-4)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
        }}
      >
        {tasks.filter((t) => !t.completed).length} Aufgabe
        {tasks.filter((t) => !t.completed).length !== 1 ? 'n' : ''} offen
        {tasks.filter((t) => t.completed).length > 0 &&
          `, ${tasks.filter((t) => t.completed).length} erledigt`}
      </p>

      {/* Grouped tasks */}
      {groupedTasks.map((group) => (
        <div key={group.planName} style={{ marginBottom: 'var(--space-4)' }}>
          <h3
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
            }}
          >
            {group.planName}
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {group.tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)',
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
                <button
                  onClick={() => handleToggleComplete(task.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    color: task.completed
                      ? 'var(--color-success)'
                      : 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {task.completed ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <Circle size={20} />
                  )}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: task.completed
                        ? 'var(--text-muted)'
                        : 'var(--text-primary)',
                      textDecoration: task.completed ? 'line-through' : 'none',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.title}
                  </span>
                  {task.dueDate && (
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        color:
                          new Date(task.dueDate) < new Date()
                            ? 'var(--color-error)'
                            : 'var(--text-muted)',
                      }}
                    >
                      Fällig: {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleRemoveFromDay(task.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: 'var(--text-lg)',
                    padding: 'var(--space-1)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity var(--transition-fast)',
                    flexShrink: 0,
                  }}
                  className="day-remove-btn"
                  title="Entfernen"
                >
                  ×
                </button>
                <style>{`
                  div:hover > .day-remove-btn { opacity: 1; }
                `}</style>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add task to day */}
      {showAddInput ? (
        <div
          style={{
            marginTop: 'var(--space-3)',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--surface-2)',
              borderRadius: 'var(--radius-md)',
              border: 'var(--border-input)',
            }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowAddInput(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }
              }}
              placeholder="Aufgabe suchen und hinzufügen..."
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => {
                setShowAddInput(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-lg)',
                padding: 0,
                display: 'flex',
              }}
            >
              ×
            </button>
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 'var(--space-1)',
                backgroundColor: 'var(--surface-0)',
                border: 'var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 10,
                overflow: 'hidden',
              }}
            >
              {searchResults.map((result: any) => (
                <button
                  key={result.id}
                  onClick={() => handleAddToDay(result)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: 'var(--border-subtle)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-primary)',
                    transition: 'background-color var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {result.title}
                  {result.planName && (
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        marginLeft: 'var(--space-2)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      {result.planName}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowAddInput(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
            marginTop: 'var(--space-2)',
            width: '100%',
          }}
        >
          <Plus size={18} />
          <span>Aufgabe hinzufügen</span>
        </button>
      )}
    </div>
  );
}
