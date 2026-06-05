import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Plus, Star, ClipboardList, Sun, LayoutDashboard } from 'lucide-react';
import { usePlans } from '../../hooks/usePlans';
import { usePlanContext } from '../../contexts/PlanContext';
import { api } from '../../services/plannerApi';
import { STYLES } from '../../lib/constants';

export default function Sidebar() {
  const { plans, loading, refetch } = usePlans();
  const { activePlanId } = usePlanContext();
  const navigate = useNavigate();
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');

  const favorites = plans.filter((p) => p.isFavorite);
  const others = plans.filter((p) => !p.isFavorite);

  const handleCreatePlan = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const plan = await api.plans.create({ name });
      setNewName('');
      setShowNewInput(false);
      refetch();
      navigate(`/plan/${plan.id}/board`);
    } catch (e) {
      /* silently fail */
    }
  };

  const handleCancelNew = () => {
    setShowNewInput(false);
    setNewName('');
  };

  return (
    <aside
      style={{
        width: STYLES.sidebarWidth,
        height: '100vh',
        backgroundColor: 'var(--surface-1)',
        borderRight: 'var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{ padding: 'var(--space-4) var(--space-3)', borderBottom: 'var(--border-default)' }}>
        <img
          src="/logos/plannercore_white_side.svg"
          alt="PlannerCore"
          style={{ height: 24, display: 'block' }}
        />
      </div>

      {/* Navigation Links */}
      <nav style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <a
          href={__DASHBOARD_URL__ || '/'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-secondary)',
            backgroundColor: 'transparent',
            transition: 'all var(--transition-fast)',
            marginBottom: 'var(--space-2)',
            border: '1px solid var(--border-default)',
          }}
        >
          <LayoutDashboard size={18} />
          <span>Cores Dashboard</span>
        </a>
        <NavLink
          to="/my/tasks"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-secondary)',
            backgroundColor: isActive ? 'var(--surface-3)' : 'transparent',
            transition: 'all var(--transition-fast)',
          })}
        >
          <ClipboardList size={18} />
          <span>Meine Aufgaben</span>
        </NavLink>
        <NavLink
          to="/my/day"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-secondary)',
            backgroundColor: isActive ? 'var(--surface-3)' : 'transparent',
            transition: 'all var(--transition-fast)',
          })}
        >
          <Sun size={18} />
          <span>Mein Tag</span>
        </NavLink>
      </nav>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'var(--border-divider)', margin: '0 var(--space-3)' }} />

      {/* Scrollable plan list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {/* Favorites Section */}
        {favorites.length > 0 && (
          <>
            <div
              style={{
                padding: 'var(--space-1) var(--space-3)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              Favoriten
            </div>
            {favorites.map((plan) => (
              <PlanLink key={plan.id} plan={plan} activePlanId={activePlanId} />
            ))}
          </>
        )}

        {/* Plans Section */}
        <div
          style={{
            padding: 'var(--space-1) var(--space-3)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
            marginTop: favorites.length > 0 ? 'var(--space-2)' : 0,
          }}
        >
          Pläne
        </div>
        {loading ? (
          <div
            style={{
              padding: 'var(--space-4)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Laden...
          </div>
        ) : (
          others.map((plan) => (
            <PlanLink key={plan.id} plan={plan} activePlanId={activePlanId} />
          ))
        )}
      </div>

      {/* New Plan Input / Button */}
      <div style={{ padding: 'var(--space-3)', borderTop: 'var(--border-divider)' }}>
        {showNewInput ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreatePlan();
                if (e.key === 'Escape') handleCancelNew();
              }}
              onBlur={() => {
                if (!newName.trim()) handleCancelNew();
              }}
              placeholder="Name des Plans..."
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--surface-2)',
                border: 'var(--border-input)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                onClick={handleCreatePlan}
                style={{
                  flex: 1,
                  padding: 'var(--space-1) var(--space-3)',
                  backgroundColor: 'var(--color-accent-red)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  fontWeight: 'var(--weight-medium)',
                }}
              >
                Erstellen
              </button>
              <button
                onClick={handleCancelNew}
                style={{
                  padding: 'var(--space-1) var(--space-3)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'var(--border-input)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewInput(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              width: '100%',
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              border: `1px dashed var(--border-strong)`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Plus size={18} />
            <span>Neuer Plan</span>
          </button>
        )}
      </div>
    </aside>
  );
}

function PlanLink({
  plan,
  activePlanId,
}: {
  plan: any;
  activePlanId: string | null;
}) {
  const isActive = activePlanId === plan.id;

  return (
    <NavLink
      to={`/plan/${plan.id}/board`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        fontSize: 'var(--text-sm)',
        fontWeight: isActive ? 'var(--weight-medium)' : 'var(--weight-normal)',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        backgroundColor: isActive ? 'var(--color-accent-red)' : 'transparent',
        transition: 'all var(--transition-fast)',
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {plan.name}
      </span>
      {plan.isFavorite && (
        <Star size={14} style={{ fill: 'var(--color-warning)', color: 'var(--color-warning)', flexShrink: 0 }} />
      )}
    </NavLink>
  );
}
