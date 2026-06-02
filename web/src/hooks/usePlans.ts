import { useState, useEffect } from 'react';
import { api } from '../services/plannerApi';

export function usePlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      setPlans(await api.plans.list());
    } catch (e) {
      /* silently fail */
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);
  return { plans, loading, refetch: load };
}

export function usePlan(planId: string) {
  const [plan, setPlan] = useState<any>(null);
  useEffect(() => {
    if (planId && planId !== 'new') {
      api.plans.get(planId).then(setPlan).catch(() => setPlan(null));
    } else {
      setPlan(null);
    }
  }, [planId]);
  return plan;
}
