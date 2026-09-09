import { useEffect, useState } from 'react';
import { fetchHealth } from '../services/api';
import type { HealthStatus } from '../types/health';

interface HealthState {
  data: HealthStatus | null;
  error: string | null;
  loading: boolean;
}

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ data: null, error: null, loading: true });

  useEffect(() => {
    let active = true;

    void fetchHealth()
      .then((data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          const message = error instanceof Error ? error.message : 'Unable to reach the ChangeLens API.';
          setState({ data: null, error: message, loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
