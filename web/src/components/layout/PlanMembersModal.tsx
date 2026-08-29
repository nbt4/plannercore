import { useEffect, useState } from 'react';
import { UserPlus, UserMinus } from 'lucide-react';
import Modal from '../shared/Modal';
import Avatar from '../shared/Avatar';
import { api } from '../../services/plannerApi';

interface PlanMembersModalProps {
  planId: string;
  open: boolean;
  onClose: () => void;
}

interface Member {
  userId: string;
  role: string;
  username: string;
  email: string;
  avatarUrl?: string;
}

interface UserResult {
  userId: string;
  username: string;
  email: string;
  avatarUrl?: string;
}

export default function PlanMembersModal({ planId, open, onClose }: PlanMembersModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadMembers = async () => {
    try {
      setMembers(await api.plans.members(planId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mitglieder konnten nicht geladen werden.');
    }
  };

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setError('');
    setLoading(true);
    loadMembers().finally(() => setLoading(false));
  }, [open, planId]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.users.search(query.trim()).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const addMember = async (user: UserResult) => {
    setSavingUserId(user.userId);
    setError('');
    try {
      await api.plans.addMember(planId, user.userId);
      await loadMembers();
      setQuery('');
      setResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Benutzer konnte nicht eingeladen werden.');
    } finally {
      setSavingUserId(null);
    }
  };

  const removeMember = async (member: Member) => {
    if (member.role === 'owner') return;
    setSavingUserId(member.userId);
    setError('');
    try {
      await api.plans.removeMember(planId, member.userId);
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mitglied konnte nicht entfernt werden.');
    } finally {
      setSavingUserId(null);
    }
  };

  const memberIds = new Set(members.map((member) => member.userId));
  const availableResults = results.filter((user) => !memberIds.has(user.userId));

  return (
    <Modal open={open} onClose={onClose} title="Plan teilen">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <label
            htmlFor="plan-member-search"
            style={{ display: 'block', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}
          >
            Benutzer einladen
          </label>
          <input
            id="plan-member-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name oder E-Mail suchen..."
            style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-input)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', outline: 'none' }}
          />
          {availableResults.length > 0 && (
            <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {availableResults.map((user) => (
                <button
                  key={user.userId}
                  onClick={() => addMember(user)}
                  disabled={savingUserId !== null}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', padding: 'var(--space-2)', border: 'none', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Avatar username={user.username} avatarUrl={user.avatarUrl} />
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{user.username}</strong>
                    <small style={{ color: 'var(--text-muted)' }}>{user.email}</small>
                  </span>
                  <UserPlus size={16} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ marginBottom: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            Mitglieder {loading ? '…' : `(${members.length})`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {members.map((member) => (
              <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Avatar username={member.username || member.userId} avatarUrl={member.avatarUrl} />
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{member.username || member.userId}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{member.role === 'owner' ? 'Besitzer' : member.email}</small>
                </span>
                {member.role !== 'owner' && (
                  <button onClick={() => removeMember(member)} disabled={savingUserId !== null} title="Mitglied entfernen" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 'var(--space-1)' }}>
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ color: 'var(--color-accent-red)', fontSize: 'var(--text-sm)' }}>{error}</div>}
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          Eingeladene Benutzer können den gesamten Plan gemeinsam bearbeiten.
        </p>
      </div>
    </Modal>
  );
}
