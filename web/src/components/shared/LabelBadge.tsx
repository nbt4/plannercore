interface LabelBadgeProps {
  name: string;
  color: string;
}

export default function LabelBadge({ name, color }: LabelBadgeProps) {
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
      {name}
    </span>
  );
}
