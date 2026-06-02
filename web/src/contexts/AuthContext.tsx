import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthUser {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
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
    fetch('/api/v1/planner/plans', { credentials: 'include' })
      .then((r) => {
        if (r.ok) {
          // Try to get user info from response headers or a dedicated endpoint
          return r.json().then((data) => {
            // If we can reach the API and get plans, we're authenticated.
            // Extract user info from the response if available.
            setUser({ id: 'session', username: 'User' });
          });
        } else if (r.status === 401) {
          setUser(null);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
