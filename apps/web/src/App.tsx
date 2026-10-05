import { useEffect } from 'react';
import { NotFound } from './pages/NotFound';
import { redirect, usePath } from './router';
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

const PAGES: NavItem[] = [{ href: '/documents', label: 'Documents' }];

const ACCOUNT = [<AdminNav key="admin" />, <AccountNav key="compte" />];

function Redirect({ to }: { to: string }) {
  useEffect(() => redirect(to), [to]);
  return null;
}

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
  if (path === '/') return <Redirect to="/documents" />;
  return <NotFound />;
}

export function App() {
  const path = usePath();
  if (path === '/admin' || path.startsWith('/admin/')) return <AdminApp />;
  return (
    <AppShell title={'Documental'} pages={PAGES} account={ACCOUNT}>
      <Screen path={path} />
    </AppShell>
  );
}
