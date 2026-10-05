import { useEffect, useState } from 'react';
import { DOCUMENT_KIND_LABEL, type DocumentDetail } from '@documental/contracts/documents';
import { api, ApiError } from '@/api';
import { Breadcrumb, formatDate, itemHref, useSignedIn } from '@/documents/shared';
import { navigate } from '@/router';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Notice';
import { Page } from '@/ui/Page';

export function DocumentPage({ id }: { id: string }) {
  const user = useSignedIn(`/documents/${id}`);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<DocumentDetail>(`/documents/${encodeURIComponent(id)}`)
      .then((result) => {
        if (!active) return;
        if (result.item.kind === 'folder') navigate(itemHref(result.item));
        else setDetail(result);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof ApiError ? caught.message : 'Chargement impossible, réessayez.',
          );
      });
    return () => {
      active = false;
    };
  }, [user, id]);

  if (!user) return null;
  if (error)
    return (
      <Page title="Document">
        <Notice tone="danger">{error}</Notice>
      </Page>
    );
  if (!detail) return null;

  const { item } = detail;
  return (
    <Page
      title={item.name}
      lede={`${DOCUMENT_KIND_LABEL[item.kind]} · modifié le ${formatDate(item.updatedAt)}${
        item.updatedBy ? ` par ${item.updatedBy.name}` : ''
      }`}
    >
      <Breadcrumb path={detail.path} current />
      <Card>
        <p data-document-content={item.id}>Le contenu du document s’affichera ici.</p>
      </Card>
    </Page>
  );
}
