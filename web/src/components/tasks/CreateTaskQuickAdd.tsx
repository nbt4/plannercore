import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlans } from '../../hooks/usePlans';
import { api } from '../../services/plannerApi';

interface CreateTaskQuickAddProps {
  assignToCurrentUser?: boolean;
  addToMyDay?: boolean;
  onCreated?: (task: any) => void;
}

export default function CreateTaskQuickAdd({
  assignToCurrentUser = false,
  addToMyDay = false,
  onCreated,
}: CreateTaskQuickAddProps) {
  const { plans } = usePlans();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [planId, setPlanId] = useState('');
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!planId && plans.length > 0) setPlanId(plans[0].id);
  }, [planId, plans]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const submit = () => {
    const trimmed = title.trim();
    const selectedPlan = plans.find((plan) => plan.id === planId);
    if (!trimmed || !selectedPlan) return;

    setTitle('');
    requestAnimationFrame(() => inputRef.current?.focus());
    submissionQueue.current = submissionQueue.current
      .then(async () => {
        const task = await api.tasks.create(selectedPlan.id, trimmed);
        if (assignToCurrentUser && user) {
          await api.tasks.addAssignee(task.id, String(user.userId));
        }
        if (addToMyDay) await api.my.addDay(task.id);
        onCreated?.({ ...task, planId: selectedPlan.id, planName: selectedPlan.name });
      })
      .catch(() => {
        // Keep quick entry open so the next task can still be entered.
      });
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        disabled={plans.length === 0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          border: '1px solid var(--color-accent-red)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-accent-red)',
          color: '#fff',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          cursor: plans.length === 0 ? 'not-allowed' : 'pointer',
          opacity: plans.length === 0 ? 0.5 : 1,
        }}
      >
        <Plus size={17} />
        Neue Aufgabe
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        flexWrap: 'wrap',
      }}
    >
      <select
        value={planId}
        onChange={(event) => setPlanId(event.target.value)}
        aria-label="Plan für neue Aufgabe"
        style={{
          padding: 'var(--space-2)',
          border: 'var(--border-input)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--surface-0)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
        }}
      >
        {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
      </select>
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            setTitle('');
            setExpanded(false);
          }
        }}
        placeholder="Aufgabentitel …"
        style={{
          flex: '1 1 220px',
          minWidth: 180,
          padding: 'var(--space-2) var(--space-3)',
          border: 'var(--border-input)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--surface-0)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          outline: 'none',
        }}
      />
      <button
        onClick={() => {
          setTitle('');
          setExpanded(false);
        }}
        style={{
          padding: 'var(--space-2)',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        Schließen
      </button>
    </div>
  );
}
