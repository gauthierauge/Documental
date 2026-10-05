import { useEffect, useState } from 'react';
import { api } from '@/api';
import { Link } from '@/router';
import { Badge } from '@/ui/Badge';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';

interface Tile {
  key: string;
  label: string;
  total: number;
  pending: { label: string; count: number; field: string } | null;
}

interface Entry {
  id: string;
  at: string;
  userEmail: string;
  summary: string;
}

function time(at: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at));
}

export function Home() {
  const [data, setData] = useState<{ cards: Tile[]; journal: Entry[] } | null>(null);

  useEffect(() => {
    api<{ cards: Tile[]; journal: Entry[] }>('/admin/accueil')
      .then(setData)
      .catch(() => setData({ cards: [], journal: [] }));
  }, []);

  if (!data) return <EmptyState title="Chargement…" />;

  return (
    <>
      <h1>Accueil</h1>
      <div className="adm-cards">
        {data.cards.map((card) => (
          <Link key={card.key} href={`/admin/${card.key}`} className="adm-tile">
            <span className="adm-tile-label">{card.label}</span>
            <strong>{card.total}</strong>
            {card.pending && card.pending.count > 0 && (
              <Badge tone="accent">
                {card.pending.count} {card.pending.label.toLowerCase()}
              </Badge>
            )}
          </Link>
        ))}
      </div>
      {data.journal.length > 0 && (
        <Card title="Activité récente">
          <ul className="adm-journal">
            {data.journal.map((e) => (
              <li key={e.id}>
                <time>{time(e.at)}</time> {e.userEmail} {e.summary}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
