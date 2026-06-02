import { useState, useEffect, useRef } from 'react';
import { Paperclip, Upload, Trash2, Download, File } from 'lucide-react';
import { api } from '../../services/plannerApi';

interface Attachment {
  id: string;
  filename: string;
  size?: number;
  url?: string;
  createdAt?: string;
}

interface AttachmentsSectionProps {
  taskId: string;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsSection({ taskId }: AttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (taskId) {
      // Load attachments from task data
      api.tasks
        .get(taskId)
        .then((task) => {
          if (task.attachments) setAttachments(task.attachments);
        })
        .catch(() => {});
    }
  }, [taskId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const created = await api.attachments.upload(taskId, file);
      setAttachments((prev) => [...prev, created]);
    } catch (err) {
      /* silently fail */
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Datei wirklich löschen?')) return;
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.attachments.delete(id);
    } catch (e) {
      /* silently fail */
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
        <Paperclip size={16} style={{ color: 'var(--text-secondary)' }} />
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
          }}
        >
          Anhänge
        </span>
      </div>

      {/* Attachment list */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-2)',
        }}
      >
        {attachments.length === 0 && (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              padding: 'var(--space-2) 0',
            }}
          >
            Keine Anhänge
          </div>
        )}
        {attachments.map((att) => (
          <div
            key={att.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              transition: 'background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <File size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {att.filename}
              </div>
              {att.size && (
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {formatSize(att.size)}
                </div>
              )}
            </div>
            {att.url && (
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 'var(--space-1)',
                  color: 'var(--text-muted)',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'all var(--transition-fast)',
                  textDecoration: 'none',
                }}
                title="Herunterladen"
              >
                <Download size={14} />
              </a>
            )}
            <button
              onClick={() => handleDelete(att.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 'var(--space-1)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition-fast)',
                flexShrink: 0,
              }}
              title="Löschen"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-1) var(--space-3)',
          backgroundColor: 'transparent',
          border: `1px dashed var(--border-strong)`,
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          cursor: uploading ? 'default' : 'pointer',
          transition: 'all var(--transition-fast)',
          width: '100%',
          justifyContent: 'center',
        }}
      >
        <Upload size={14} />
        <span>{uploading ? 'Hochladen...' : 'Datei hochladen'}</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />
    </div>
  );
}
