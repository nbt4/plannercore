import { useState, useRef, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../../services/plannerApi';

interface NotesSectionProps {
  taskId: string;
  initialValue?: string;
}

export default function NotesSection({ taskId, initialValue = '' }: NotesSectionProps) {
  const [value, setValue] = useState(initialValue);
  const divRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (divRef.current && initialValue) {
        divRef.current.innerHTML = initialValue;
      }
    }
  }, [initialValue]);

  const handleBlur = async () => {
    const html = divRef.current?.innerHTML || '';
    if (html !== initialValue) {
      try {
        await api.tasks.update(taskId, { richTextNotes: html });
      } catch (e) {
        /* silently fail */
      }
    }
  };

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
        }}
      >
        <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
          }}
        >
          Notizen
        </span>
      </div>
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
        data-placeholder="Notizen hinzufügen..."
        style={{
          minHeight: '80px',
          padding: 'var(--space-2)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--surface-2)',
          border: 'var(--border-input)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-relaxed)',
          outline: 'none',
          cursor: 'text',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
        }}
        onInput={() => setValue(divRef.current?.innerHTML || '')}
      />
      <style>{`
        [contenteditable=true]:empty:before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          pointer-events: none;
        }
        [contenteditable=true]:focus {
          border-color: var(--color-accent-red);
        }
      `}</style>
    </div>
  );
}
