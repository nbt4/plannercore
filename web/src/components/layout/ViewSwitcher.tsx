import { useNavigate } from 'react-router-dom';
import { usePlanContext } from '../../contexts/PlanContext';
import {
  Kanban,
  LayoutGrid,
  Calendar,
  BarChart3,
  GanttChart,
  Users,
  Target,
} from 'lucide-react';

const views = [
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'grid', label: 'Raster', icon: LayoutGrid },
  { id: 'schedule', label: 'Zeitplan', icon: Calendar },
  { id: 'charts', label: 'Diagramme', icon: BarChart3 },
  { id: 'timeline', label: 'Zeitachse', icon: GanttChart },
  { id: 'people', label: 'Personen', icon: Users },
  { id: 'goals', label: 'Ziele', icon: Target },
];

export default function ViewSwitcher() {
  const { activePlanId, activeView } = usePlanContext();
  const navigate = useNavigate();

  if (!activePlanId || activePlanId === 'new') return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-1)',
        padding: '2px',
        backgroundColor: 'var(--surface-1)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {views.map((view) => {
        const isActive = activeView === view.id;
        const Icon = view.icon;
        return (
          <button
            key={view.id}
            onClick={() => navigate(`/plan/${activePlanId}/${view.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: 'var(--space-1) var(--space-2)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 'var(--weight-medium)' : 'var(--weight-normal)',
              backgroundColor: isActive ? 'var(--surface-3)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
              whiteSpace: 'nowrap',
            }}
            title={view.label}
          >
            <Icon size={16} />
            <span className="hidden lg:inline">{view.label}</span>
          </button>
        );
      })}
    </div>
  );
}
