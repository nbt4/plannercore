import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AuthUser {
  userId: number;
  username: string;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, refetch: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchId, setFetchId] = useState(0);

  const refetch = useCallback(() => setFetchId((n) => n + 1), []);

  useEffect(() => {
    setLoading(true);
    fetch('/api/v1/planner/me', { credentials: 'include' })
      .then((r) => {
        if (r.ok) return r.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        setUser({
          userId: data.userId,
          username: data.username,
          isAdmin: data.isAdmin,
        });
      })
      .catch(() => {
        setUser(null);
        // Redirect to login unless already there
        if (window.location.pathname !== '/login') {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }
      })
      .finally(() => setLoading(false));
  }, [fetchId]);

  return (
    <AuthContext.Provider value={{ user, loading, refetch }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
