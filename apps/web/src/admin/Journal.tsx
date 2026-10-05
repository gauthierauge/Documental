import { useEffect, useState } from 'react';
import { api } from '@/api';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';

interface Entry {
  id: string;
  at: string;
  userEmail: string;
  summary: string;
}

export function Journal() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Entry[]; total: number } | null>(null);

  useEffect(() => {
    api<{ rows: Entry[]; total: number }>(`/admin/journal?page=${page}`)
      .then(setData)
      .catch(() => setData({ rows: [], total: 0 }));
  }, [page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  return (
    <>
      <h1>Journal d’activité</h1>
      <p className="adm-muted">
        Chaque modification faite dans le panel, avec son auteur. Le journal ne se modifie pas.
      </p>
      <Card>
        <ul className="adm-journal">
          {data?.rows.map((e) => (
            <li key={e.id}>
              <time>{new Date(e.at).toLocaleString('fr-FR')}</time> {e.userEmail} {e.summary}
            </li>
          ))}
        </ul>
        {data?.rows.length === 0 && <EmptyState title="Rien pour l’instant." />}
      </Card>
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
