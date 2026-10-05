import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EntityForm } from '@/admin/EntityForm';
import type { AdminEntity } from '@/admin/meta';

const entity: AdminEntity = {
  key: 'produits',
  label: 'Produits',
  actions: ['lire', 'creer', 'modifier', 'archiver'],
  allowed: ['lire', 'creer', 'modifier', 'archiver'],
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
    { key: 'actif', label: 'Actif', type: 'oui_non', required: false },
    { key: 'categorie', label: 'Catégorie', type: 'lien', required: false, target: 'categories' },
  ],
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Fiche d’un contenu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState(null, '', '/');
  });

  it('ajoute une ligne avec les valeurs saisies, montant en centimes, puis ouvre sa fiche', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).endsWith('/options')
        ? respond([{ id: 'c1', label: 'Pâtisserie' }])
        : respond({ row: { id: 'p9' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<EntityForm entity={entity} id={null} />);
    fireEvent.change(screen.getByLabelText(/Nom/), { target: { value: 'Tarte' } });
    fireEvent.change(screen.getByLabelText('Prix'), { target: { value: '12,50' } });
    fireEvent.click(screen.getByLabelText('Actif'));
    fireEvent.change(await screen.findByLabelText('Catégorie'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/produits/p9'));
    const [, init] = fetchMock.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      nom: 'Tarte',
      prix: 1250,
      statut: 'Brouillon',
      actif: true,
      categorie: 'c1',
    });
  });

  it('modifie une fiche existante, dit les erreurs par champ, puis l’archive', async () => {
    let patched = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/options')) return respond([]);
        if (url.endsWith('/archiver'))
          return respond({ row: { id: 'p1', nom: 'Tarte', archived_at: '2026-10-04' } });
        if (init?.method === 'PATCH') {
          patched += 1;
          return patched === 1
            ? respond({ error: 'Champs invalides', fields: { nom: 'Obligatoire' } }, 422)
            : respond({ row: { id: 'p1', nom: 'Tarte aux pommes' } });
        }
        return respond({
          row: {
            id: 'p1',
            nom: 'Tarte',
            prix: 990,
            statut: 'Publié',
            actif: false,
            categorie: null,
          },
          history: [
            {
              id: 'h1',
              at: '2026-10-01T09:00:00.000Z',
              userEmail: 'claire@exemple.fr',
              summary: 'a créé la ligne',
            },
          ],
        });
      }),
    );
    render(<EntityForm entity={entity} id="p1" />);
    expect(await screen.findByRole('heading', { name: 'Tarte' })).toBeInTheDocument();
    expect(screen.getByText(/a créé la ligne/)).toBeInTheDocument();
    expect(await screen.findByDisplayValue('9,90')).toBe(screen.getByLabelText('Prix'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Obligatoire')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Enregistré.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    expect(await screen.findByText('Ligne archivée.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer' })).toBeInTheDocument();
  });

  it('sans le droit de modifier : lecture seule, sans bouton', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/options')
          ? respond([])
          : respond({ row: { id: 'p1', nom: 'Tarte' }, history: [] }),
      ),
    );
    render(<EntityForm entity={{ ...entity, allowed: ['lire'] }} id="p1" />);
    expect(await screen.findByRole('heading', { name: 'Tarte' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });
});
