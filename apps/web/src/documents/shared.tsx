import { useEffect } from 'react';
import type { DocumentCrumb, DocumentItem } from '@documental/contracts/documents';
import { type CurrentUser, useCurrentUser } from '@/auth/client';
import { Link, navigate } from '@/router';
import '@/documents/documents.css';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function itemHref(item: Pick<DocumentItem, 'id' | 'kind'>): string {
  return item.kind === 'folder' ? `/documents/dossiers/${item.id}` : `/documents/${item.id}`;
}

export function useSignedIn(here: string): CurrentUser | null {
  const { user, pending } = useCurrentUser();
  useEffect(() => {
    if (!pending && !user) navigate(`/connexion?suite=${encodeURIComponent(here)}`);
  }, [pending, user, here]);
  return user;
}

export function Breadcrumb({ path, current }: { path: DocumentCrumb[]; current?: boolean }) {
  const last = path.length - 1;
  return (
    <nav aria-label="Fil d’Ariane" className="doc-fil">
      <ol>
        <li>
          {path.length === 0 && current ? (
            <span aria-current="page">Documents</span>
          ) : (
            <Link href="/documents">Documents</Link>
          )}
        </li>
        {path.map((crumb, index) => (
          <li key={crumb.id}>
            {index === last && current ? (
              <span aria-current="page">{crumb.name}</span>
            ) : (
              <Link href={`/documents/dossiers/${crumb.id}`}>{crumb.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
