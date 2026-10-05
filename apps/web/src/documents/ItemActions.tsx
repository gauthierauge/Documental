import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  DOCUMENT_KIND_LABEL,
  type DocumentItem,
  documentNameProblem,
  type FolderSummary,
  normalizeDocumentName,
} from '@documental/contracts/documents';
import { api, ApiError } from '@/api';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field, Input, Select } from '@/ui/Field';
import { Notice } from '@/ui/Notice';

export type Action =
  | { kind: 'create'; type: 'folder' | 'text' }
  | { kind: 'rename'; item: DocumentItem }
  | { kind: 'move'; item: DocumentItem }
  | { kind: 'delete'; item: DocumentItem };

interface Props {
  action: Action;
  folderId: string | null;
  onDone: () => void;
  onCancel: () => void;
}

function failure(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Action impossible pour le moment, réessayez.';
}

function NameForm({ action, folderId, onDone, onCancel }: Props) {
  const creating = action.kind === 'create';
  const [name, setName] = useState(action.kind === 'rename' ? action.item.name : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.querySelector('input')?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = documentNameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (action.kind === 'create') {
        await api('/documents', {
          method: 'POST',
          body: JSON.stringify({
            kind: action.type,
            name: normalizeDocumentName(name),
            parentId: folderId,
          }),
        });
      } else if (action.kind === 'rename') {
        await api(`/documents/${action.item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: normalizeDocumentName(name) }),
        });
      }
      onDone();
    } catch (caught) {
      setError(failure(caught));
      setBusy(false);
    }
  }

  const title = creating
    ? action.type === 'folder'
      ? 'Nouveau dossier'
      : 'Nouveau document'
    : `Renommer « ${action.kind === 'rename' ? action.item.name : ''} »`;

  return (
    <Card title={title}>
      <form ref={form} className="ui-formulaire" onSubmit={submit} noValidate>
        <Field label="Nom" error={error} required>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <div className="ui-actions">
          <Button type="submit" variant="primaire" disabled={busy}>
            {creating ? 'Créer' : 'Renommer'}
          </Button>
          <Button variant="discret" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}

function folderLabel(folder: FolderSummary, byId: Map<string, FolderSummary>): string {
  const names = [folder.name];
  let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
  while (parent && names.length < 64) {
    names.unshift(parent.name);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return names.join(' / ');
}

export function moveTargets(folders: FolderSummary[], moved: DocumentItem) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const isInsideMoved = (folder: FolderSummary): boolean => {
    for (
      let f: FolderSummary | undefined = folder;
      f;
      f = f.parentId ? byId.get(f.parentId) : undefined
    ) {
      if (f.id === moved.id) return true;
    }
    return false;
  };
  return folders
    .filter((f) => !isInsideMoved(f))
    .map((f) => ({ id: f.id, label: folderLabel(f, byId) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }));
}

function MoveForm({
  item,
  onDone,
  onCancel,
}: { item: DocumentItem } & Omit<Props, 'action' | 'folderId'>) {
  const [targets, setTargets] = useState<{ id: string; label: string }[] | null>(null);
  const [target, setTarget] = useState(item.parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ folders: FolderSummary[] }>('/documents/dossiers')
      .then(({ folders }) => setTargets(moveTargets(folders, item)))
      .catch((caught: unknown) => setError(failure(caught)));
  }, [item]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/documents/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ parentId: target || null }),
      });
      onDone();
    } catch (caught) {
      setError(failure(caught));
      setBusy(false);
    }
  }

  return (
    <Card title={`Déplacer « ${item.name} »`}>
      <form className="ui-formulaire" onSubmit={submit}>
        <Field label="Destination" error={error}>
          {(control) => (
            <Select
              {...control}
              value={target}
              disabled={!targets}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Documents (racine)</option>
              {targets?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="ui-actions">
          <Button
            type="submit"
            variant="primaire"
            disabled={busy || !targets || target === (item.parentId ?? '')}
          >
            Déplacer
          </Button>
          <Button variant="discret" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DeleteForm({
  item,
  onDone,
  onCancel,
}: { item: DocumentItem } & Omit<Props, 'action' | 'folderId'>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api(`/documents/${item.id}`, { method: 'DELETE' });
      onDone();
    } catch (caught) {
      setError(failure(caught));
      setBusy(false);
    }
  }

  return (
    <Card title={`Supprimer « ${item.name} » ?`}>
      <p>
        {item.kind === 'folder'
          ? 'Le dossier et tout ce qu’il contient seront supprimés définitivement.'
          : `Ce ${DOCUMENT_KIND_LABEL[item.kind].toLowerCase()} sera supprimé définitivement.`}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="ui-actions">
        <Button variant="danger" disabled={busy} onClick={confirm}>
          Supprimer
        </Button>
        <Button variant="discret" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </Card>
  );
}

export function ItemActions(props: Props) {
  const { action } = props;
  if (action.kind === 'move') return <MoveForm item={action.item} {...props} />;
  if (action.kind === 'delete') return <DeleteForm item={action.item} {...props} />;
  return <NameForm {...props} />;
}
