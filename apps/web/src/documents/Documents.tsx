import { useEffect, useState } from 'react';
import { DOCUMENT_KIND_LABEL, type FolderListing } from '@documental/contracts/documents';
import { api, ApiError } from '@/api';
import { type Action, ItemActions } from '@/documents/ItemActions';
import { Breadcrumb, formatDate, itemHref, useSignedIn } from '@/documents/shared';
import { Link } from '@/router';
import { Button, ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Notice } from '@/ui/Notice';
import { Page } from '@/ui/Page';
import { Table } from '@/ui/Table';

function actionKey(action: Action): string {
  return action.kind === 'create' ? `create-${action.type}` : `${action.kind}-${action.item.id}`;
}

export function Documents({ folderId }: { folderId: string | null }) {
  const here = folderId ? `/documents/dossiers/${folderId}` : '/documents';
  const user = useSignedIn(here);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setAction(null);
  }, [folderId]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setError(null);
    api<FolderListing>(`/documents${folderId ? `?dossier=${encodeURIComponent(folderId)}` : ''}`)
      .then((result) => active && setListing(result))
      .catch((caught: unknown) => {
        if (!active) return;
        setListing(null);
        setError(caught instanceof ApiError ? caught.message : 'Chargement impossible, réessayez.');
      });
    return () => {
      active = false;
    };
  }, [user, folderId, version]);

  if (!user) return null;

  const title = listing?.folder?.name ?? (folderId ? '…' : 'Documents');
  const parentHref = listing?.folder?.parentId
    ? `/documents/dossiers/${listing.folder.parentId}`
    : '/documents';

  return (
    <Page title={title}>
      {listing && listing.path.length > 0 && <Breadcrumb path={listing.path} current />}
      {error && <Notice tone="danger">{error}</Notice>}

      {listing && (
        <div className="ui-actions">
          {listing.canEdit && (
            <>
              <Button
                variant="primaire"
                onClick={() => setAction({ kind: 'create', type: 'text' })}
              >
                Nouveau document
              </Button>
              <Button onClick={() => setAction({ kind: 'create', type: 'folder' })}>
                Nouveau dossier
              </Button>
            </>
          )}
          {listing.folder && (
            <ButtonLink variant="discret" href={parentHref}>
              Dossier parent
            </ButtonLink>
          )}
        </div>
      )}

      {action && (
        <ItemActions
          key={actionKey(action)}
          action={action}
          folderId={folderId}
          onCancel={() => setAction(null)}
          onDone={() => {
            setAction(null);
            setVersion((v) => v + 1);
          }}
        />
      )}

      {listing && listing.items.length > 0 && (
        <Table label={`Contenu de ${title}`}>
          <thead>
            <tr>
              <th scope="col">Nom</th>
              <th scope="col">Type</th>
              <th scope="col">Dernière modification</th>
              <th scope="col">Modifié par</th>
              {listing.canEdit && (
                <th scope="col">
                  <span className="doc-masque">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {listing.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={itemHref(item)} className={`doc-nom doc-nom-${item.kind}`}>
                    {item.name}
                  </Link>
                </td>
                <td>{DOCUMENT_KIND_LABEL[item.kind]}</td>
                <td>
                  <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time>
                </td>
                <td>{item.updatedBy?.name ?? 'Compte supprimé'}</td>
                {listing.canEdit && (
                  <td>
                    <div className="doc-actions">
                      <Button
                        variant="discret"
                        aria-label={`Renommer ${item.name}`}
                        onClick={() => setAction({ kind: 'rename', item })}
                      >
                        Renommer
                      </Button>
                      <Button
                        variant="discret"
                        aria-label={`Déplacer ${item.name}`}
                        onClick={() => setAction({ kind: 'move', item })}
                      >
                        Déplacer
                      </Button>
                      <Button
                        variant="discret"
                        aria-label={`Supprimer ${item.name}`}
                        onClick={() => setAction({ kind: 'delete', item })}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {listing && listing.items.length === 0 && (
        <EmptyState
          title={listing.folder ? 'Ce dossier est vide.' : 'Aucun document pour l’instant.'}
        >
          {listing.canEdit
            ? 'Créez un document ou un dossier pour commencer.'
            : 'Les documents apparaîtront ici dès qu’un éditeur en créera.'}
        </EmptyState>
      )}
    </Page>
  );
}
