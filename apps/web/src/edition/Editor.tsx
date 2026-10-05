import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RemoteCursor } from '@documental/contracts/edition';
import { transformIndex } from '@documental/contracts/text-operation';
import { type CaretBox, caretBox, colorFor } from '@/edition/caret';
import { EditionController, type EditionStatus } from '@/edition/controller';
import { Button } from '@/ui/Button';
import '@/edition/edition.css';

const STATUS_LABEL: Record<EditionStatus, string> = {
  chargement: 'Chargement…',
  enregistre: 'Enregistré',
  enregistrement: 'Enregistrement…',
  'hors-ligne':
    'Hors ligne : vos modifications sont gardées et partiront au retour de la connexion.',
  erreur: 'Enregistrement impossible.',
};

type PlacedCursor = RemoteCursor & { box: CaretBox; color: string };

export function presentPeople(cursors: RemoteCursor[], selfId: string): string[] {
  const names = new Map<string, string>();
  for (const cursor of cursors) {
    if (cursor.user.id !== selfId) names.set(cursor.user.id, cursor.user.name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function Editor({ documentId, userId }: { documentId: string; userId: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<EditionController | null>(null);
  const [status, setStatus] = useState<EditionStatus>('chargement');
  const [message, setMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [ready, setReady] = useState(false);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [placed, setPlaced] = useState<PlacedCursor[]>([]);
  const [layout, setLayout] = useState(0);

  const relayout = () => setLayout((n) => n + 1);

  const reportSelection = () => {
    const el = area.current;
    if (el) controller.current?.moveCursor(el.selectionStart, el.selectionEnd);
  };

  useEffect(() => {
    setReady(false);
    setCursors([]);
    const current = new EditionController(
      documentId,
      `documental:edition:${userId}:${documentId}`,
      {
        status(next, detail) {
          setStatus(next);
          setMessage(detail ?? null);
        },
        access(editable) {
          setCanEdit(editable);
        },
        cursors(next) {
          setCursors(next);
        },
        remote(text, operations) {
          const el = area.current;
          if (!el) return;
          let start = el.selectionStart;
          let end = el.selectionEnd;
          for (const operation of operations) {
            start = transformIndex(start, operation);
            end = transformIndex(end, operation);
          }
          el.value = text;
          el.setSelectionRange(start, end);
          relayout();
        },
      },
    );
    controller.current = current;
    current
      .start()
      .then(({ text, canEdit: editable }) => {
        if (area.current) area.current.value = text;
        setCanEdit(editable);
        setReady(true);
        relayout();
      })
      .catch(() => {
        setStatus('erreur');
        setMessage('Chargement impossible, réessayez.');
      });

    const online = () => current.retryNow();
    const leaving = (event: BeforeUnloadEvent) => {
      if (current.pending) event.preventDefault();
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', leaving);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', leaving);
      current.stop();
      controller.current = null;
    };
  }, [documentId, userId]);

  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => relayout());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    setPlaced(
      cursors
        .filter((cursor) => cursor.user.id !== userId)
        .map((cursor) => ({
          ...cursor,
          box: caretBox(el, cursor.end),
          color: colorFor(cursor.user.id),
        }))
        .filter((cursor) => cursor.box.top >= 0 && cursor.box.top < el.clientHeight),
    );
  }, [cursors, layout, userId]);

  const people = presentPeople(cursors, userId);

  return (
    <div className="ed-editeur">
      <div className="ed-barre">
        <p className={`ed-etat ed-etat-${status}`} role="status">
          {message ?? STATUS_LABEL[status]}
        </p>
        {people.length > 0 && (
          <p className="ed-presents">
            <span className="ed-etat">Aussi ici :</span>
            {people.map((name) => (
              <span key={name} className="ed-present">
                {name}
              </span>
            ))}
          </p>
        )}
        {status === 'erreur' && (
          <Button variant="discret" onClick={() => window.location.reload()}>
            Recharger
          </Button>
        )}
        {ready && !canEdit && <p className="ed-etat">Lecture seule</p>}
      </div>
      <div className="ed-zone">
        <textarea
          ref={area}
          className="ed-texte"
          aria-label="Contenu du document"
          spellCheck
          disabled={!ready}
          readOnly={!canEdit || status === 'erreur'}
          onInput={(event) => {
            controller.current?.change(event.currentTarget.value, event.currentTarget.selectionEnd);
            reportSelection();
            relayout();
          }}
          onSelect={reportSelection}
          onScroll={relayout}
        />
        <div className="ed-curseurs" aria-hidden="true">
          {placed.map((cursor) => (
            <span
              key={cursor.key}
              className={
                cursor.box.top < cursor.box.height ? 'ed-curseur ed-curseur-bas' : 'ed-curseur'
              }
              style={{
                top: cursor.box.top,
                left: cursor.box.left,
                height: cursor.box.height,
                backgroundColor: cursor.color,
              }}
            >
              <span className="ed-curseur-nom" style={{ backgroundColor: cursor.color }}>
                {cursor.user.name}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
