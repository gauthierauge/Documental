import { lazy, Suspense } from 'react';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { usePath } from './router';
import { AppShell } from './ui/AppShell';
import type { NavItem } from './ui/navigation';
import { Account } from './auth/Account';
import { ForgotPassword } from './auth/ForgotPassword';
import { Login } from './auth/Login';
import { SetPassword } from './auth/SetPassword';
import { AccountNav } from './auth/AccountNav';
import { AdminApp } from './admin/AdminApp';
import { AdminNav } from './admin/AdminNav';
import { DocumentPage } from '@/documents/DocumentPage';
import { Documents } from '@/documents/Documents';

// La page « Démarrage » n'existe qu'en développement : en production, la condition vaut false
// à la compilation et Vite ne met même pas son code dans le bundle.
const Startup = import.meta.env.DEV
  ? lazy(() => import('./startup/Startup').then((m) => ({ default: m.Startup })))
  : null;

/** Les pages du menu principal, dans l'ordre. En développement, l'accueil est « Démarrage ». */
const PAGES: NavItem[] = [
  { href: '/', label: Startup ? 'Démarrage' : 'Accueil' },
  { href: '/documents', label: 'Documents' },
];

/** Les liens du compte dans la coquille, selon la session (et le rôle, avec le panel admin). */
const ACCOUNT = [<AdminNav key="admin" />, <AccountNav key="compte" />];

function Screen({ path }: { path: string }) {
  if (path === '/connexion') return <Login />;
  if (path === '/mot-de-passe/oublie') return <ForgotPassword />;
  if (path === '/mot-de-passe/nouveau') return <SetPassword />;
  if (path === '/compte') return <Account />;
  if (path === '/documents') return <Documents folderId={null} />;
  const folder = /^\/documents\/dossiers\/([^/]+)$/.exec(path);
  if (folder?.[1]) return <Documents folderId={decodeURIComponent(folder[1])} />;
  const doc = /^\/documents\/([^/]+)$/.exec(path);
  if (doc?.[1]) return <DocumentPage id={decodeURIComponent(doc[1])} />;
  if (path === '/')
    return Startup ? (
      <Suspense fallback={null}>
        <Startup />
      </Suspense>
    ) : (
      <Home />
    );
  return <NotFound />;
}

export function App() {
  const path = usePath();
  // Le panel a sa propre mise en page (menu latéral), hors de la coquille du site.
  if (path === '/admin' || path.startsWith('/admin/')) return <AdminApp />;
  return (
    <AppShell title={'Documental'} pages={PAGES} account={ACCOUNT}>
      <Screen path={path} />
    </AppShell>
  );
}
