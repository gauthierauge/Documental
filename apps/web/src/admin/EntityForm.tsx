import { type FormEvent, useEffect, useState } from 'react';
import { formatValue } from '@documental/contracts/admin-types';
import { ApiError, api } from '@/api';
import { Link, navigate } from '@/router';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Notice';
import { FieldInput } from './FieldInput';
import type { AdminEntity } from './meta';

type Row = Record<string, unknown> & { id: string; archived_at?: string | null };

interface HistoryEntry {
  id: string;
  at: string;
  userEmail: string;
  summary: string;
}

function defaults(entity: AdminEntity): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of entity.fields) {
    if (f.type === 'liste') values[f.key] = f.options?.[0] ?? null;
    if (f.type === 'oui_non') values[f.key] = false;
  }
  return values;
}

export function EntityForm({ entity, id }: { entity: AdminEntity; id: string | null }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => (id ? {} : defaults(entity)));
  const [row, setRow] = useState<Row | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editable = id ? entity.allowed.includes('modifier') : entity.allowed.includes('creer');

  useEffect(() => {
    if (!id) return;
    api<{ row: Row; history: HistoryEntry[] }>(`/admin/contenus/${entity.key}/${id}`)
      .then((data) => {
        setRow(data.row);
        setHistory(data.history);
        setValues(Object.fromEntries(entity.fields.map((f) => [f.key, data.row[f.key] ?? null])));
      })
      .catch(() => setStatus('Introuvable.'));
  }, [entity, id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setStatus(null);
    try {
      const result = await api<{ row: Row }>(
        id ? `/admin/contenus/${entity.key}/${id}` : `/admin/contenus/${entity.key}`,
        {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(values),
        },
      );
      if (id) {
        setRow(result.row);
        setStatus('Enregistré.');
      } else navigate(`/admin/${entity.key}/${result.row.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.body.fields) setErrors(e.body.fields);
      setStatus(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!row) return;
    const action = row.archived_at ? 'restaurer' : 'archiver';
    const result = await api<{ row: Row }>(`/admin/contenus/${entity.key}/${row.id}/${action}`, {
      method: 'POST',
    });
    setRow(result.row);
    setStatus(
      result.row.archived_at ? 'Archivé : la ligne n’apparaît plus dans la liste.' : 'Restauré.',
    );
  }

  return (
    <>
      <div className="adm-head">
        <div>
          <Link href={`/admin/${entity.key}`} className="adm-back">
            ← {entity.label}
          </Link>
          <h1>
            {id
              ? row && entity.fields[0]
                ? formatValue(entity.fields[0], row[entity.fields[0].key]) || 'Fiche'
                : 'Fiche'
              : 'Ajouter'}
          </h1>
        </div>
        {row && entity.allowed.includes('archiver') && (
          <Button onClick={toggleArchive}>{row.archived_at ? 'Restaurer' : 'Archiver'}</Button>
        )}
      </div>
      {row?.archived_at && <Notice tone="attention">Ligne archivée.</Notice>}
      <Card>
        <form className="adm-form" onSubmit={save} noValidate>
          {entity.fields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key]}
              error={errors[f.key]}
              disabled={!editable || busy}
              onChange={(value) => setValues((v) => ({ ...v, [f.key]: value }))}
            />
          ))}
          {errors._ && <Notice tone="danger">{errors._}</Notice>}
          {editable && (
            <div className="adm-form-foot ui-actions">
              <Button type="submit" variant="primaire" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              {status && <span role="status">{status}</span>}
            </div>
          )}
        </form>
      </Card>
      {history.length > 0 && (
        <Card title="Historique">
          <ul className="adm-journal">
            {history.map((h) => (
              <li key={h.id}>
                <time>{new Date(h.at).toLocaleString('fr-FR')}</time> {h.userEmail} {h.summary}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
