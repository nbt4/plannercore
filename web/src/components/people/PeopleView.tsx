import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../../services/plannerApi';
import Avatar from '../shared/Avatar';
import ProgressBar from '../shared/ProgressBar';
import EmptyState from '../shared/EmptyState';

interface Person {
  username: string;
  userId?: string;
  taskCount: number;
  completedCount: number;
}

export default function PeopleView() {
  const { planId } = useParams<{ planId: string }>();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (planId && planId !== 'new') {
      setLoading(true);
      api.analytics
        .workload(planId)
        .then((data: any) => {
          const mapped = (data || []).map((w: any) => ({
            username: w.username || w.userId || w.name || 'Unbekannt',
            userId: w.userId,
            taskCount: w.taskCount ?? w.tasks ?? 0,
            completedCount: w.completedCount ?? w.completed ?? 0,
          }));
          // Sort by task count (most first)
          mapped.sort((a: Person, b: Person) => b.taskCount - a.taskCount);
          setPeople(mapped);
        })
        .catch(() => setPeople([]))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      setPeople([]);
    }
  }, [planId]);

  if (!planId || planId === 'new') {
    return (
      <EmptyState
        icon={Users}
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

  if (people.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Keine Teammitglieder"
        description="Weisen Sie Aufgaben Bearbeiter zu, um die Teamübersicht zu sehen."
      />
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
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        {people.map((person) => {
          const progress =
            person.taskCount > 0
              ? Math.round((person.completedCount / person.taskCount) * 100)
              : 0;

          return (
            <div
              key={person.userId || person.username}
              style={{
                backgroundColor: 'var(--surface-0)',
                borderRadius: 'var(--radius-lg)',
                border: 'var(--border-default)',
                padding: 'var(--space-4)',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'center',
              }}
            >
              <Avatar username={person.username} size="lg" />

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
                  {person.username}
                </h3>

                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {person.taskCount}
                    </strong>{' '}
                    Aufgaben
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-success)',
                    }}
                  >
                    <strong>{person.completedCount}</strong> erledigt
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <ProgressBar progress={progress} />
                  </div>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {progress}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
