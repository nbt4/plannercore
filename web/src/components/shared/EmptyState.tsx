import { ReactNode, ComponentType } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon | ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-12) var(--space-4)',
        textAlign: 'center',
        height: '100%',
      }}
    >
      <Icon size={48} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: 'var(--space-4)' }} />
      <h3
        style={{
          margin: 0,
          fontSize: 'var(--text-lg)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-secondary)',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: 'var(--space-2) 0 0',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            maxWidth: '20rem',
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 'var(--space-6)' }}>{action}</div>}
    </div>
  );
}
