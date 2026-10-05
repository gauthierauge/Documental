import { createContext, useContext } from 'react';
import type { Action, EntityConfig, Role, SettingConfig } from '@documental/contracts/admin-types';

export interface AdminEntity extends EntityConfig {
  allowed: Action[];
}

export interface AdminMeta {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    roleLabel: string;
    strongFactor: boolean;
  };
  /** Le facteur fort exigé des admins pour les comptes et les réglages (passkey, double authentification…). */
  strongFactor: { label: string; missing: string; none: string };
  /** L'invitation selon la méthode de connexion : message affiché, et bouton pour renvoyer l'accès s'il existe. */
  access: { invited: string; resend: string | null };
  sections: { accueil: boolean; comptes: boolean; exports: boolean; journal: true };
  entities: AdminEntity[];
  settings: SettingConfig[];
}

export const MetaContext = createContext<AdminMeta | null>(null);

export function useMeta(): AdminMeta {
  const meta = useContext(MetaContext);
  if (!meta) throw new Error('useMeta hors du panel admin');
  return meta;
}

export function entityByKey(meta: AdminMeta, key: string): AdminEntity | undefined {
  return meta.entities.find((e) => e.key === key);
}
