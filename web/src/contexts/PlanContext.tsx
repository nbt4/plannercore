import { createContext, useContext, useState, ReactNode } from 'react';

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

export function PlanProvider({ children }: { children: ReactNode }) {
  const [activePlanId, setActivePlan] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('board');
  return (
    <PlanContext.Provider value={{ activePlanId, setActivePlan, activeView, setActiveView }}>
      {children}
    </PlanContext.Provider>
  );
}

export const usePlanContext = () => useContext(PlanContext);
