import { useState, type MouseEvent } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import toast from '../../utils/toast';

interface TaskCompletionCheckboxProps {
  completed: boolean;
  taskTitle: string;
  onToggle: (completed: boolean) => Promise<unknown>;
  size?: number;
}

export default function TaskCompletionCheckbox({
  completed,
  taskTitle,
  onToggle,
  size = 20,
}: TaskCompletionCheckboxProps) {
  const [saving, setSaving] = useState(false);

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      await onToggle(!completed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Status konnte nicht geändert werden');
    } finally {
      setSaving(false);
    }
  };

  const label = completed
    ? `Aufgabe „${taskTitle}“ wieder öffnen`
    : `Aufgabe „${taskTitle}“ als abgeschlossen markieren`;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={label}
      title={completed ? 'Wieder öffnen' : 'Als abgeschlossen markieren'}
      disabled={saving}
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: completed ? 'var(--color-success)' : 'var(--text-muted)',
        cursor: saving ? 'wait' : 'pointer',
        opacity: saving ? 0.55 : 1,
      }}
    >
      {completed ? <CheckCircle2 size={size} /> : <Circle size={size} />}
    </button>
  );
}
