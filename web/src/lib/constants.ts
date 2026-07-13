export const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'var(--planner-priority-urgent)',
  important: 'var(--planner-priority-important)',
  medium: 'var(--planner-priority-medium)',
  low: 'var(--planner-priority-low)',
};

export const STATUS_COLORS: Record<string, string> = {
  'not-started': 'var(--text-muted)',
  'in-progress': 'var(--color-info)',
  completed: 'var(--color-success)',
};

export const STATUS_LABELS: Record<string, string> = {
  'not-started': 'Nicht begonnen',
  'in-progress': 'In Bearbeitung',
  completed: 'Abgeschlossen',
};

export const LABEL_COLORS = [
  'var(--planner-label-red)', 'var(--planner-label-blue)', 'var(--planner-label-green)',
  'var(--planner-label-yellow)', 'var(--planner-label-purple)', 'var(--planner-label-orange)',
  'var(--planner-label-pink)', 'var(--planner-label-teal)',
];

export const STYLES = {
  cardBg: 'var(--color-surface)',
  cardShadow: 'var(--planner-card-shadow)',
  cardRadius: 'var(--planner-card-radius)',
  bucketBg: 'var(--planner-bucket-bg)',
  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  sidebarWidth: 'var(--planner-sidebar-width)',
} as const;
