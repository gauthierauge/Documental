import type { ReactNode } from 'react';
import { usePath } from '@/router';
import { EmptyState } from '@/ui/EmptyState';
import { Accounts } from './Accounts';
import { AdminShell } from './AdminShell';
import { EntityForm } from './EntityForm';
import { EntityList } from './EntityList';
import { Home } from './Home';
import { Journal } from './Journal';
import { type AdminMeta, entityByKey, useMeta } from './meta';
import { Settings } from './Settings';

export function adminScreen(meta: AdminMeta, first: string, second: string): ReactNode | null {
  if (first === '')
    return meta.sections.accueil ? <Home /> : <EntityList entity={meta.entities[0]} />;
  if (first === 'comptes' && meta.sections.comptes && meta.user.role === 'admin')
    return <Accounts />;
  if (first === 'reglages' && meta.user.role === 'admin') return <Settings />;
  if (first === 'journal' && meta.user.role !== 'lecteur') return <Journal />;
  const entity = entityByKey(meta, first);
  if (!entity) return null;
  if (second === 'nouveau') return <EntityForm entity={entity} id={null} />;
  if (second) return <EntityForm entity={entity} id={second} />;
  return <EntityList entity={entity} />;
}

function Screen({ path }: { path: string }) {
  const [, , first = '', second = ''] = path.split('/').map(decodeURIComponent);
  return adminScreen(useMeta(), first, second) ?? <EmptyState title="Page introuvable." />;
}

export function AdminApp() {
  const path = usePath();
  return (
    <AdminShell>
      <Screen path={path} />
    </AdminShell>
  );
}
