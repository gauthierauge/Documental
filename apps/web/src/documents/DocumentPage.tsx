import { useEffect, useMemo, useState } from 'react';
import type { DocumentDetail, DocumentPerson } from '@documental/contracts/documents';
import { api, ApiError } from '@/api';
import { DocumentBar } from '@/documents/DocumentBar';
import { itemHref, useSignedIn } from '@/documents/shared';
import { Editor, type EditorState, type Follow } from '@/edition/Editor';
import { SharePanel } from '@/invitations/SharePanel';
import { navigate } from '@/router';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Notice';
import { Page } from '@/ui/Page';
import { CommunicationPanel } from '@/communication/CommunicationPanel';

export function DocumentPage({ id }: { id: string }) {
  const user = useSignedIn(`/documents/${id}`);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [people, setPeople] = useState<DocumentPerson[]>([]);
  const [follow, setFollow] = useState<Follow | null>(null);
  const online = useMemo(() => new Set(people.map((p) => p.id)), [people]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setState(null);
    setPeople([]);
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
  const self = { id: user.id, name: user.name };
  const canWrite = state?.ready ? state.canEdit : detail.access.write;

  return (
    <div className="ui-page doc-page">
      <DocumentBar
        item={item}
        path={detail.path}
        self={self}
        people={people}
        state={item.kind === 'text' ? state : null}
        onFollow={(person) => setFollow({ userId: person.id, nonce: Date.now() })}
        share={
          item.kind === 'text' ? (
            <SharePanel
              documentId={item.id}
              documentName={item.name}
              userId={user.id}
              canWrite={canWrite}
              online={online}
            />
          ) : null
        }
      />
      {item.kind === 'text' ? (
        <div className="com-espace">
          <Editor
            documentId={item.id}
            userId={user.id}
            onState={setState}
            onPeople={setPeople}
            follow={follow}
          />
          <CommunicationPanel documentId={item.id} user={self} />
        </div>
      ) : (
        <Card>
          <p>L’aperçu de ce fichier arrive bientôt.</p>
        </Card>
      )}
    </div>
  );
}
