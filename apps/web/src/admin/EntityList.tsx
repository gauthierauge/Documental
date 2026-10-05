import { useEffect, useState } from 'react';
import { formatValue } from '@documental/contracts/admin-types';
import { api } from '@/api';
import { Link, navigate } from '@/router';
import { Badge } from '@/ui/Badge';
import { Button, ButtonLink, buttonClass } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Checkbox, Input, Select } from '@/ui/Field';
import { Table } from '@/ui/Table';
import type { AdminEntity } from './meta';

interface ListResult {
  rows: (Record<string, unknown> & { id: string })[];
  total: number;
  perPage: number;
  labels: Record<string, Record<string, string>>;
}

export function EntityList({ entity }: { entity: AdminEntity | undefined }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [data, setData] = useState<ListResult | null>(null);

  const key = entity?.key ?? '';
  const filterable = entity?.fields.filter((f) => f.type === 'liste') ?? [];
  const columns = entity?.fields.filter((f) => f.type !== 'texte_long').slice(0, 5) ?? [];

  // Changer de contenu repart de zéro.
  // oxlint-disable react/exhaustive-deps -- réinitialisation voulue au changement de contenu.
  useEffect(() => {
    setQ('');
    setPage(1);
    setArchived(false);
    setFilters({});
  }, [key]);
  // oxlint-enable react/exhaustive-deps

  useEffect(() => {
    if (!key) return;
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set('q', q.trim());
    if (archived) params.set('archives', '1');
    for (const [k, v] of Object.entries(filters)) if (v) params.set(`f.${k}`, v);
    const timer = setTimeout(() => {
      api<ListResult>(`/admin/contenus/${key}?${params}`)
        .then(setData)
        .catch(() => setData(null));
    }, 150);
    return () => clearTimeout(timer);
  }, [key, q, page, archived, filters]);

  if (!entity) return <EmptyState title="Aucun contenu." />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const numeric = (type: string) =>
    type === 'montant' || type === 'nombre' ? 'ui-num' : undefined;

  return (
    <>
      <div className="adm-head">
        <h1>{entity.label}</h1>
        <div className="ui-actions">
          {entity.allowed.includes('exporter') && (
            <a
              className={buttonClass('secondaire')}
              href={`/api/admin/contenus/${entity.key}/export.csv`}
              download
            >
              Exporter
            </a>
          )}
          {entity.allowed.includes('creer') && (
            <ButtonLink variant="primaire" href={`/admin/${entity.key}/nouveau`}>
              Ajouter
            </ButtonLink>
          )}
        </div>
      </div>

      <div className="adm-toolbar">
        <div className="adm-search">
          <Input
            type="search"
            aria-label="Rechercher"
            placeholder="Rechercher…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {filterable.map((f) => (
          <Select
            key={f.key}
            aria-label={f.label}
            className="ui-champ-compact"
            value={filters[f.key] ?? ''}
            onChange={(e) => {
              setFilters({ ...filters, [f.key]: e.target.value });
              setPage(1);
            }}
          >
            <option value="">{f.label} : tous</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {f.label} : {o}
              </option>
            ))}
          </Select>
        ))}
        {entity.allowed.includes('archiver') && (
          <Checkbox
            label="Archives"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
        )}
      </div>

      <Table label={entity.label}>
        <thead>
          <tr>
            {columns.map((f) => (
              <th key={f.key} scope="col" className={numeric(f.type)}>
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.rows.map((row) => (
            <tr
              key={row.id}
              className="adm-row"
              onClick={() => navigate(`/admin/${entity.key}/${row.id}`)}
            >
              {columns.map((f, i) => {
                const raw = row[f.key];
                const text =
                  f.type === 'lien' && typeof raw === 'string'
                    ? (data.labels[f.key]?.[raw] ?? '')
                    : formatValue(f, raw);
                return (
                  <td key={f.key} className={numeric(f.type)}>
                    {i === 0 ? (
                      <Link href={`/admin/${entity.key}/${row.id}`}>{text || 'Sans titre'}</Link>
                    ) : f.type === 'liste' ? (
                      <Badge tone={raw === f.options?.[0] ? 'accent' : 'neutre'}>{text}</Badge>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
      {data && data.rows.length === 0 && (
        <EmptyState
          title={
            q || Object.values(filters).some(Boolean)
              ? 'Aucun résultat.'
              : archived
                ? 'Aucune archive.'
                : 'Rien pour l’instant.'
          }
        />
      )}

      {pages > 1 && (
        <nav className="ui-actions" aria-label="Pages">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Précédente
          </Button>
          <span>
            Page {page} sur {pages}
          </span>
          <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Suivante
          </Button>
        </nav>
      )}
    </>
  );
}
