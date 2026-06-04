import { useParams, useNavigate } from 'react-router-dom';
import { Star, Copy, Trash2, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { usePlan } from '../../hooks/usePlans';
import { usePlans } from '../../hooks/usePlans';
import { api } from '../../services/plannerApi';
import ViewSwitcher from './ViewSwitcher';

export default function PlanHeader() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const plan = usePlan(planId || '');
  const { refetch } = usePlans();

  const isNewPlan = !planId || planId === 'new';

  if (isNewPlan) {
    return (
      <header
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 'var(--border-default)',
          backgroundColor: 'var(--surface-0)',
          padding: '0 var(--space-4)',
        }}
      >
        <img
          src="/logos/plannercore_black_icon.svg"
          alt="PlannerCore"
          style={{ height: 24 }}
        />
        <ViewSwitcher />
      </header>
    );
  }

  const handleToggleFavorite = async () => {
    if (!planId) return;
    try {
      await api.plans.toggleFavorite(planId);
      refetch();
    } catch (e) {
      /* silently fail */
    }
  };

  const handleCopy = async () => {
    if (!planId) return;
    try {
      const copied = await api.plans.copy(planId);
      refetch();
      navigate(`/plan/${copied.id}/board`);
    } catch (e) {
      /* silently fail */
    }
  };

  const handleDelete = async () => {
    if (!planId) return;
    try {
      await api.plans.delete(planId);
      refetch();
      navigate('/my/tasks');
    } catch (e) {
      /* silently fail */
    }
  };

  return (
    <header
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        borderBottom: 'var(--border-default)',
        backgroundColor: 'var(--surface-0)',
        padding: '0 var(--space-4)',
        flexShrink: 0,
      }}
    >
      {/* Logo & Plan Name & Star */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
        <img
          src="/logos/plannercore_black_icon.svg"
          alt="PlannerCore"
          style={{ height: 24, flexShrink: 0 }}
        />
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {plan?.name || 'Laden...'}
        </h1>
        {plan && (
          <button
            onClick={handleToggleFavorite}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--space-1)',
              borderRadius: 'var(--radius-sm)',
              color: plan?.isFavorite ? 'var(--color-warning)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color var(--transition-fast)',
            }}
            title={plan?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star
              size={18}
              style={plan?.isFavorite ? { fill: 'var(--color-warning)' } : undefined}
            />
          </button>
        )}
      </div>

      {/* Center: ViewSwitcher */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <ViewSwitcher />
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <IconButton onClick={handleCopy} title="Plan kopieren" icon={Copy} />
        <IconButton onClick={handleDelete} title="Plan löschen" icon={Trash2} />
        <IconButton onClick={() => {}} title="Mehr" icon={MoreHorizontal} />
      </div>
    </header>
  );
}

function IconButton({
  onClick,
  title,
  icon: Icon,
}: {
  onClick: () => void;
  title: string;
  icon: LucideIcon;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 'var(--space-2)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-2)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
      }}
    >
      <Icon size={18} />
    </button>
  );
}
