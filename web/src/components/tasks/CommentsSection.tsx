import { useState, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { api } from '../../services/plannerApi';
import Avatar from '../shared/Avatar';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  username?: string;
  userId?: string;
}

interface CommentsSectionProps {
  taskId: string;
}

export default function CommentsSection({ taskId }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    if (taskId) {
      api.comments
        .list(taskId)
        .then(setComments)
        .catch(() => setComments([]));
    }
  }, [taskId]);

  const handleAdd = async () => {
    const content = newComment.trim();
    if (!content) return;
    try {
      const created = await api.comments.add(taskId, content);
      setComments((prev) => [...prev, created]);
      setNewComment('');
    } catch (e) {
      /* silently fail */
    }
  };

  const relativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <MessageSquare size={16} style={{ color: 'var(--text-secondary)' }} />
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
          }}
        >
          Kommentare
        </span>
        {comments.length > 0 && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            ({comments.length})
          </span>
        )}
      </div>

      {/* Comment list */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          maxHeight: 300,
          overflowY: 'auto',
          marginBottom: 'var(--space-3)',
        }}
      >
        {comments.length === 0 && (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: 'var(--space-4)',
            }}
          >
            Noch keine Kommentare
          </div>
        )}
        {comments.map((comment) => (
          <div
            key={comment.id}
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ flexShrink: 0, marginTop: '2px' }}>
              <Avatar
                username={comment.username || comment.userId || '?'}
                size="sm"
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--space-2)',
                  marginBottom: '2px',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {comment.username || comment.userId || 'Unbekannt'}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {relativeTime(comment.createdAt)}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                  lineHeight: 'var(--leading-relaxed)',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'break-word',
                }}
              >
                {comment.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Add comment */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          alignItems: 'flex-end',
        }}
      >
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Kommentar schreiben..."
          style={{
            flex: 1,
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--surface-2)',
            border: 'var(--border-input)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            outline: 'none',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newComment.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-2)',
            backgroundColor: newComment.trim()
              ? 'var(--color-accent-red)'
              : 'var(--surface-3)',
            color: newComment.trim() ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: newComment.trim() ? 'pointer' : 'default',
            transition: 'all var(--transition-fast)',
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
