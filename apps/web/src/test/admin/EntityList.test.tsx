// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EntityList } from '@/admin/EntityList';
import type { AdminEntity } from '@/admin/meta';

const entity: AdminEntity = {
  key: 'produits',
  label: 'Produits',
  actions: ['lire', 'creer', 'modifier', 'archiver', 'exporter'],
  allowed: ['lire', 'creer', 'modifier', 'archiver', 'exporter'],
  fields: [
    { key: 'nom', label: 'Nom', type: 'texte', required: true },
    { key: 'prix', label: 'Prix', type: 'montant', required: false },
    {
      key: 'statut',
      label: 'Statut',
      type: 'liste',
      required: false,
      options: ['Brouillon', 'Publié'],
    },
  ],
};

function respond(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function listing(rows: Record<string, unknown>[], total = rows.length) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
    respond({ rows, total, perPage: 25, labels: {} }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Liste d’un contenu', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche les lignes : la première colonne mène à la fiche, le montant en euros', async () => {
    listing([{ id: 'p1', nom: 'Tarte', prix: 1250, statut: 'Publié' }]);
    render(<EntityList entity={entity} />);
    const link = await screen.findByRole('link', { name: 'Tarte' });
    expect(link).toHaveAttribute('href', '/admin/produits/p1');
    expect(screen.getByText(/12,50/)).toBeInTheDocument();
    expect(screen.getByText('Publié')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajouter' })).toHaveAttribute(
      'href',
      '/admin/produits/nouveau',
    );
    expect(screen.getByRole('link', { name: 'Exporter' })).toHaveAttribute(
      'href',
      '/api/admin/contenus/produits/export.csv',
    );
  });

  it('la recherche et les filtres partent à l’API', async () => {
    const fetchMock = listing([]);
    render(<EntityList entity={entity} />);
    expect(await screen.findByText('Rien pour l’instant.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher' }), {
      target: { value: 'tarte' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Statut' }), {
      target: { value: 'Publié' },
    });
    await waitFor(() => {
      const url = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(url).toContain('q=tarte');
      expect(url).toContain('f.statut=Publi');
    });
    expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
  });

  it('pagine au-delà d’une page', async () => {
    const fetchMock = listing([{ id: 'p1', nom: 'Tarte' }], 60);
    render(<EntityList entity={entity} />);
    expect(await screen.findByText('Page 1 sur 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('page=2'));
  });

  it('sans contenu : un état vide', () => {
    render(<EntityList entity={undefined} />);
    expect(screen.getByText('Aucun contenu.')).toBeInTheDocument();
  });
});
