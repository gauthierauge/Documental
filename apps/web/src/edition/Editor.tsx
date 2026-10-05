import { useEffect, useRef, useState } from 'react';
import { transformIndex } from '@documental/contracts/text-operation';
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

export function Editor({ documentId, userId }: { documentId: string; userId: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<EditionController | null>(null);
  const [status, setStatus] = useState<EditionStatus>('chargement');
  const [message, setMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
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

  return (
    <div className="ed-editeur">
      <div className="ed-barre">
        <p className={`ed-etat ed-etat-${status}`} role="status">
          {message ?? STATUS_LABEL[status]}
        </p>
        {status === 'erreur' && (
          <Button variant="discret" onClick={() => window.location.reload()}>
            Recharger
          </Button>
        )}
        {ready && !canEdit && <p className="ed-etat">Lecture seule</p>}
      </div>
      <textarea
        ref={area}
        className="ed-texte"
        aria-label="Contenu du document"
        spellCheck
        disabled={!ready}
        readOnly={!canEdit || status === 'erreur'}
        onInput={(event) =>
          controller.current?.change(event.currentTarget.value, event.currentTarget.selectionEnd)
        }
      />
    </div>
  );
}
