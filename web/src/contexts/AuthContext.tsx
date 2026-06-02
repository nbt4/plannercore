import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthUser {
  userId: number;
  username: string;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        // Redirect to login if not on login page
        if (window.location.pathname !== '/login') {
          const loginUrl = `${window.location.origin}/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          window.location.href = loginUrl;
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
