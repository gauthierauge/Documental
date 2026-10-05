import { useEffect, useState } from 'react';
import type { StartupState } from '@documental/contracts/startup';
import { api } from '@/api';

export function useStartupState(): StartupState | null {
  const [state, setState] = useState<StartupState | null>(null);
  useEffect(() => {
    api<StartupState>('/demarrage').then(setState, () => setState(null));
  }, []);
  return state;
}
