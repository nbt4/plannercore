import { X } from 'lucide-react';
import { STATUS_LABELS } from '../../lib/constants';
import { EMPTY_FILTERS, hasActiveFilters, type TaskFilters } from '../../lib/taskFilters';

interface FilterBarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  buckets: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  assignees: { userId: string; username: string }[];
}

const selectStyle: React.CSSProperties = {
  padding: 'var(--space-1) var(--space-2)',
  backgroundColor: 'var(--surface-1)',
  border: 'var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-xs)',
  outline: 'none',
  cursor: 'pointer',
};

export default function FilterBar({ filters, onChange, buckets, labels, assignees }: FilterBarProps) {
  const set = (key: keyof TaskFilters, value: string) => onChange({ ...filters, [key]: value });
  const active = hasActiveFilters(filters);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        alignItems: 'center',
        marginBottom: 'var(--space-3)',
      }}
    >
      <select style={selectStyle} value={filters.bucketId} onChange={(e) => set('bucketId', e.target.value)}>
        <option value="">Alle Spalten</option>
        {buckets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <select style={selectStyle} value={filters.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
        <option value="">Alle Bearbeiter</option>
        {assignees.map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.username}
          </option>
        ))}
      </select>
      <select style={selectStyle} value={filters.priority} onChange={(e) => set('priority', e.target.value)}>
        <option value="">Alle Prioritäten</option>
        <option value="urgent">Urgent</option>
        <option value="important">Important</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select style={selectStyle} value={filters.status} onChange={(e) => set('status', e.target.value)}>
        <option value="">Alle Status</option>
        <option value="not-started">{STATUS_LABELS['not-started']}</option>
        <option value="in-progress">{STATUS_LABELS['in-progress']}</option>
        <option value="completed">{STATUS_LABELS['completed']}</option>
      </select>
      <select style={selectStyle} value={filters.labelId} onChange={(e) => set('labelId', e.target.value)}>
        <option value="">Alle Labels</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {active && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            padding: 'var(--space-1) var(--space-2)',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          <X size={12} /> Filter zurücksetzen
        </button>
      )}
    </div>
  );
}
