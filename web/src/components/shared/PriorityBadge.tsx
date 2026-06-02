import { PRIORITY_COLORS } from '../../lib/constants';
import { AlertCircle, ArrowUp, Minus, ArrowDown, type LucideIcon } from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  urgent: AlertCircle,
  important: ArrowUp,
  medium: Minus,
  low: ArrowDown,
};

interface PriorityBadgeProps {
  priority: string;
}

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  const color = PRIORITY_COLORS[priority] || 'var(--text-muted)';
  const Icon = icons[priority];

  if (!priority || priority === 'none') return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '1px var(--space-2)',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        color: color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {Icon && <Icon size={12} />}
      <span style={{ textTransform: 'capitalize' }}>{priority}</span>
    </span>
  );
}
