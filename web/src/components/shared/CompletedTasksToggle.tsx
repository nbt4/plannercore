import { Eye, EyeOff } from 'lucide-react';

interface CompletedTasksToggleProps {
  showCompleted: boolean;
  completedCount: number;
  onChange: (showCompleted: boolean) => void;
}

export default function CompletedTasksToggle({
  showCompleted,
  completedCount,
  onChange,
}: CompletedTasksToggleProps) {
  const Icon = showCompleted ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-pressed={showCompleted}
      onClick={() => onChange(!showCompleted)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: 'var(--space-1) var(--space-2)',
        backgroundColor: showCompleted ? 'var(--surface-2)' : 'transparent',
        border: 'var(--border-default)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={14} />
      {showCompleted ? 'Abgeschlossene ausblenden' : 'Abgeschlossene anzeigen'}
      {completedCount > 0 && ` (${completedCount})`}
    </button>
  );
}
