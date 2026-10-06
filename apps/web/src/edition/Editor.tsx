import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DocumentPerson } from '@documental/contracts/documents';
import type { RemoteCursor } from '@documental/contracts/edition';
import { transformIndex } from '@documental/contracts/text-operation';
import { type CaretBox, caretBox, colorFor } from '@/edition/caret';
import { imagesOf, pastedImages } from '@/documents/upload';
import { EditionController, type EditionStatus } from '@/edition/controller';
import '@/edition/edition.css';

type PlacedCursor = RemoteCursor & { box: CaretBox; color: string };

export interface EditorState {
  status: EditionStatus;
  message: string | null;
  canEdit: boolean;
  ready: boolean;
}

export interface Follow {
  userId: string;
  nonce: number;
}

export interface Insertion {
  text: string;
  nonce: number;
}

export function presentPeople(cursors: RemoteCursor[], selfId: string): DocumentPerson[] {
  const people = new Map<string, DocumentPerson>();
  for (const cursor of cursors) {
    if (cursor.user.id !== selfId) people.set(cursor.user.id, cursor.user);
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function Editor({
  documentId,
  userId,
  onState,
  onPeople,
  onText,
  onFiles,
  hidden = false,
  follow,
  insert,
}: {
  documentId: string;
  userId: string;
  onState?: (state: EditorState) => void;
  onPeople?: (people: DocumentPerson[]) => void;
  onText?: (text: string) => void;
  onFiles?: (files: File[]) => void;
  hidden?: boolean;
  follow?: Follow | null;
  insert?: Insertion | null;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<EditionController | null>(null);
  const [status, setStatus] = useState<EditionStatus>('chargement');
  const [message, setMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [ready, setReady] = useState(false);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [placed, setPlaced] = useState<PlacedCursor[]>([]);
  const [layout, setLayout] = useState(0);
  const [followed, setFollowed] = useState<string | null>(null);
  const callbacks = useRef({ onState, onPeople, onText });
  const [depot, setDepot] = useState(false);
  const latestCursors = useRef(cursors);

  useLayoutEffect(() => {
    callbacks.current = { onState, onPeople, onText };
    latestCursors.current = cursors;
  });

  const relayout = () => setLayout((n) => n + 1);

  const reportSelection = () => {
    const el = area.current;
    if (el) controller.current?.moveCursor(el.selectionStart, el.selectionEnd);
  };

  useEffect(() => {
    callbacks.current.onState?.({ status, message, canEdit, ready });
  }, [status, message, canEdit, ready]);

  useEffect(() => {
    callbacks.current.onPeople?.(presentPeople(cursors, userId));
  }, [cursors, userId]);

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
          callbacks.current.onText?.(text);
          relayout();
        },
      },
    );
    controller.current = current;
    current
      .start()
      .then(({ text, canEdit: editable }) => {
        if (area.current) area.current.value = text;
        callbacks.current.onText?.(text);
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

  useEffect(() => {
    const el = area.current;
    if (!insert || !el || el.readOnly) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const texte = `${el.value.slice(0, start)}${insert.text}${el.value.slice(end)}`;
    const caret = start + insert.text.length;
    el.value = texte;
    el.setSelectionRange(caret, caret);
    callbacks.current.onText?.(texte);
    controller.current?.change(texte, caret);
    controller.current?.moveCursor(caret, caret);
    el.focus();
    relayout();
  }, [insert]);

  useEffect(() => {
    const el = area.current;
    if (!follow || !el) return;
    const cursor = latestCursors.current.find((c) => c.user.id === follow.userId);
    if (!cursor) return;
    const box = caretBox(el, cursor.end);
    el.scrollTop += box.top - el.clientHeight / 3;
    setFollowed(cursor.key);
    relayout();
    const timer = setTimeout(() => setFollowed(null), 1_500);
    return () => clearTimeout(timer);
  }, [follow]);

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

  return (
    <div className={depot ? 'ed-zone ed-zone-depot' : 'ed-zone'} hidden={hidden}>
      <textarea
        ref={area}
        className="ed-texte"
        aria-label="Contenu du document"
        spellCheck
        disabled={!ready}
        readOnly={!canEdit || status === 'erreur'}
        onInput={(event) => {
          callbacks.current.onText?.(event.currentTarget.value);
          controller.current?.change(event.currentTarget.value, event.currentTarget.selectionEnd);
          reportSelection();
          relayout();
        }}
        onSelect={reportSelection}
        onScroll={relayout}
        onPaste={(event) => {
          if (!onFiles || event.currentTarget.readOnly) return;
          const images = pastedImages(event.clipboardData);
          if (images.length === 0) return;
          event.preventDefault();
          onFiles(images);
        }}
        onDragOver={(event) => {
          if (!onFiles || event.currentTarget.readOnly) return;
          if (imagesOf(event.dataTransfer.files).length === 0 && !event.dataTransfer.items.length)
            return;
          event.preventDefault();
          setDepot(true);
        }}
        onDragLeave={() => setDepot(false)}
        onDrop={(event) => {
          setDepot(false);
          if (!onFiles || event.currentTarget.readOnly) return;
          const images = imagesOf(event.dataTransfer.files);
          if (images.length === 0) return;
          event.preventDefault();
          onFiles(images);
        }}
      />
      <div className="ed-curseurs" aria-hidden="true">
        {placed.map((cursor) => (
          <span
            key={cursor.key}
            className={[
              'ed-curseur',
              cursor.box.top < cursor.box.height ? 'ed-curseur-bas' : '',
              followed === cursor.key ? 'ed-curseur-suivi' : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
  );
}
