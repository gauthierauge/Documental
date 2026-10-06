import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
import {
  type DocumentFile,
  FILE_MAX_BYTES,
  FILE_MIMES,
  FILE_TYPES,
  fileHref,
  formatFileSize,
} from '@documental/contracts/documents';
import { api } from '@/api';
import { uploadFailure, uploadFile } from '@/documents/upload';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Notice } from '@/ui/Notice';
import '@/documents/documents.css';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export function Attachments({
  documentId,
  files: all,
  canWrite,
  canManage,
  onChange,
}: {
  documentId: string;
  files: DocumentFile[];
  canWrite: boolean;
  canManage: boolean;
  onChange: (files: DocumentFile[]) => void;
}) {
  const files = all.filter((file) => file.usage === 'attachment');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function envoyer(chosen: FileList | null) {
    if (!chosen || chosen.length === 0) return;
    setBusy(true);
    setError(null);
    const current = [...all];
    try {
      for (const file of chosen) {
        const added = await uploadFile(documentId, file, 'attachment');
        current.push(added);
        onChange([...current]);
      }
    } catch (caught) {
      setError(uploadFailure(caught));
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  async function supprimer(file: DocumentFile) {
    setBusy(true);
    setError(null);
    try {
      await api(`/documents/fichiers/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      onChange(all.filter((f) => f.id !== file.id));
    } catch (caught) {
      setError(uploadFailure(caught));
    }
    setBusy(false);
  }

  function deposer(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(false);
    if (canWrite && !busy) void envoyer(event.dataTransfer.files);
  }

  return (
    <Card title={`Fichiers joints${files.length ? ` (${files.length})` : ''}`} level={2}>
      {error && <Notice tone="danger">{error}</Notice>}

      {files.length > 0 ? (
        <ul className="doc-pieces">
          {files.map((file) => (
            <li key={file.id} className="doc-piece">
              <a
                className={`doc-piece-nom doc-piece-${FILE_TYPES[file.mime].extension}`}
                href={fileHref(file.id)}
              >
                {file.name}
              </a>
              <span className="doc-discret">
                {FILE_TYPES[file.mime].label} · {formatFileSize(file.size)} ·{' '}
                {dateFormat.format(new Date(file.createdAt))}
                {file.createdBy ? ` · ${file.createdBy.name}` : ''}
              </span>
              {canManage && (
                <Button
                  variant="discret"
                  disabled={busy}
                  aria-label={`Supprimer ${file.name}`}
                  onClick={() => void supprimer(file)}
                >
                  Supprimer
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Aucun fichier joint.">
          {canWrite
            ? 'Déposez un PDF ou une image, ou choisissez un fichier.'
            : 'Les fichiers joints apparaîtront ici.'}
        </EmptyState>
      )}

      {canWrite && (
        <div
          className={over ? 'doc-depot doc-depot-survol' : 'doc-depot'}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={deposer}
        >
          <input
            ref={input}
            id={`doc-fichier-${documentId}`}
            type="file"
            multiple
            accept={FILE_MIMES.join(',')}
            disabled={busy}
            onChange={(event: ChangeEvent<HTMLInputElement>) => void envoyer(event.target.files)}
          />
          <label htmlFor={`doc-fichier-${documentId}`} className="ui-aide">
            PDF, PNG, JPEG, WebP ou GIF, {formatFileSize(FILE_MAX_BYTES)} au plus.
          </label>
          {busy && <span className="doc-discret">Envoi en cours…</span>}
        </div>
      )}
    </Card>
  );
}
