import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface PlanContextValue {
  activePlanId: string | null;
  setActivePlan: (id: string | null) => void;
  activeView: string;
  setActiveView: (view: string) => void;
}

const PlanContext = createContext<PlanContextValue>({
  activePlanId: null,
  setActivePlan: () => {},
  activeView: 'board',
  setActiveView: () => {},
});

const VIEWS = ['board', 'grid', 'schedule', 'charts', 'timeline', 'people', 'goals'];

export function PlanProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [activePlanId, setActivePlan] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('board');

  // Sync activePlanId from URL
  useEffect(() => {
    const match = location.pathname.match(/\/plan\/([^/]+)/);
    setActivePlan(match ? match[1] : null);
  }, [location.pathname]);

  // Sync activeView from URL
  useEffect(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (VIEWS.includes(lastSegment)) {
      setActiveView(lastSegment);
    } else if (activePlanId) {
      setActiveView('board');
    }
  }, [location.pathname, activePlanId]);

  return (
    <PlanContext.Provider
      value={{ activePlanId, setActivePlan, activeView, setActiveView }}
    >
      {children}
    </PlanContext.Provider>
  );
}

export const usePlanContext = () => useContext(PlanContext);
