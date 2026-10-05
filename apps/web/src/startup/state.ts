import { useEffect, useState } from 'react';
import type { StartupState } from '@documental/contracts/startup';
import { api } from '@/api';

/** L'état des modules vu par l'API ; null pendant le chargement ou si l'API ne répond pas. */
export function useStartupState(): StartupState | null {
  const [state, setState] = useState<StartupState | null>(null);
  useEffect(() => {
    api<StartupState>('/demarrage').then(setState, () => setState(null));
  }, []);
  return state;
}
