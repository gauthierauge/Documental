import { useEffect, useMemo, useState } from 'react';
import {
  type DocumentDetail,
  type DocumentFile,
  type DocumentPerson,
  IMAGE_MIMES,
  markdownImageRef,
} from '@documental/contracts/documents';
import { api, ApiError } from '@/api';
import { Attachments } from '@/documents/Attachments';
import { DocumentBar } from '@/documents/DocumentBar';
import { Markdown } from '@/documents/MarkdownPreview';
import { itemHref, useSignedIn } from '@/documents/shared';
import { uploadFailure, uploadFile } from '@/documents/upload';
import { Editor, type EditorState, type Follow, type Insertion } from '@/edition/Editor';
import { SharePanel } from '@/invitations/SharePanel';
import { navigate } from '@/router';
import { Button } from '@/ui/Button';
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
  const [apercu, setApercu] = useState(false);
  const [texte, setTexte] = useState('');
  const [insert, setInsert] = useState<Insertion | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const online = useMemo(() => new Set(people.map((p) => p.id)), [people]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setState(null);
    setPeople([]);
    setApercu(false);
    setTexte('');
    setInsert(null);
    setEnvoi(null);
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
  const ouvert = detail;

  async function insererImages(images: File[]) {
    setEnvoi(null);
    const courant = [...ouvert.files];
    try {
      for (const image of images) {
        const file = await uploadFile(ouvert.item.id, image, 'inline');
        courant.push(file);
        setDetail({ ...ouvert, files: [...courant] });
        setInsert({ text: `\n${markdownImageRef(file)}\n`, nonce: Date.now() });
      }
    } catch (caught) {
      setEnvoi(uploadFailure(caught));
    }
  }

  function choisirImage() {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = IMAGE_MIMES.join(',');
    picker.multiple = true;
    picker.addEventListener('change', () => void insererImages([...(picker.files ?? [])]));
    picker.click();
  }

  return (
    <div className="ui-page doc-page">
      <DocumentBar
        item={item}
        path={detail.path}
        self={self}
        people={people}
        state={item.kind === 'text' ? state : null}
        vues={
          item.kind === 'text' ? (
            <div className="doc-vues" role="group" aria-label="Affichage">
              {canWrite && !apercu && (
                <Button variant="discret" onClick={choisirImage}>
                  Insérer une image
                </Button>
              )}
              <div className="ui-segment">
                <Button
                  variant={apercu ? 'discret' : 'secondaire'}
                  aria-pressed={!apercu}
                  onClick={() => setApercu(false)}
                >
                  Rédiger
                </Button>
                <Button
                  variant={apercu ? 'secondaire' : 'discret'}
                  aria-pressed={apercu}
                  onClick={() => setApercu(true)}
                >
                  Aperçu
                </Button>
              </div>
            </div>
          ) : null
        }
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
          <div className="com-contenu">
            <Editor
              documentId={item.id}
              userId={user.id}
              onState={setState}
              onPeople={setPeople}
              onText={setTexte}
              onFiles={(images) => void insererImages(images)}
              hidden={apercu}
              follow={follow}
              insert={insert}
            />
            {envoi && <Notice tone="danger">{envoi}</Notice>}
            {apercu &&
              (texte.trim() ? (
                <Markdown source={texte} />
              ) : (
                <p className="doc-discret">Ce document est vide.</p>
              ))}
            <Attachments
              documentId={item.id}
              files={detail.files}
              canWrite={canWrite}
              canManage={detail.access.manage}
              onChange={(files: DocumentFile[]) => setDetail({ ...detail, files })}
            />
          </div>
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
