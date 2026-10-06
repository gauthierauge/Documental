import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { ApiError, api } from '@/api';
import { Link, navigate, usePath } from '@/router';
import { EmptyState } from '@/ui/EmptyState';
import { Notice } from '@/ui/Notice';
import { type AdminMeta, MetaContext } from './meta';
import './admin.css';

export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePath();
  const [meta, setMeta] = useState<AdminMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminMeta>('/admin/meta')
      .then(setMeta)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401)
          navigate(`/connexion?suite=${encodeURIComponent(path)}`);
        else setError(e instanceof Error ? e.message : 'Erreur');
      });
  }, []);

  if (error) return <EmptyState title={error} action={<Link href="/">Retour au site</Link>} />;
  if (!meta) return <EmptyState title="Chargement…" />;

  const current = path.split('/')[2] ?? '';
  const nav = (key: string, label: string) => (
    <Link
      href={key ? `/admin/${key}` : '/admin'}
      className="ui-nav-lien"
      aria-current={current === key ? 'page' : undefined}
    >
      {label}
    </Link>
  );

  return (
    <MetaContext.Provider value={meta}>
      <div className="adm">
        <nav className="adm-side" aria-label="Panel admin">
          <Link href="/" className="adm-brand">
            {'Documental'}
          </Link>
          {meta.sections.accueil && nav('', 'Accueil')}
          {meta.entities.map((e) => (
            <Fragment key={e.key}>{nav(e.key, e.label)}</Fragment>
          ))}
          <span className="adm-rule" />
          {meta.user.role === 'admin' && meta.sections.comptes && nav('comptes', 'Comptes')}
          {meta.user.role === 'admin' && meta.settings.length > 0 && nav('reglages', 'Réglages')}
          {meta.user.role !== 'lecteur' && nav('journal', 'Journal')}
          <span className="adm-grow" />
          <Link href="/compte" className="adm-me">
            <span className="adm-avatar" aria-hidden="true">
              {meta.user.email.slice(0, 2).toUpperCase()}
            </span>
            <span>
              {meta.user.email}
              <small>{meta.user.roleLabel}</small>
            </span>
          </Link>
        </nav>
        <main className="adm-main">
          {meta.user.role === 'admin' && !meta.user.strongFactor && (
            <Notice tone="attention">
              {meta.strongFactor.missing}. <Link href="/compte">Mon compte</Link>
            </Notice>
          )}
          {children}
        </main>
      </div>
    </MetaContext.Provider>
  );
}
