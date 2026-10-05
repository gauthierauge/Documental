// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DocumentItem, FolderListing } from '@documental/contracts/documents';
import { type CurrentUser, useCurrentUser } from '@/auth/client';
import { Documents } from '@/documents/Documents';

vi.mock('@/auth/client', () => ({ useCurrentUser: vi.fn() }));

const editor = { id: 'u1', email: 'e@exemple.fr', name: 'Éa', role: 'editeur' } as CurrentUser;

function item(kind: DocumentItem['kind'], id: string, name: string): DocumentItem {
  return {
    id,
    kind,
    name,
    parentId: null,
    createdAt: '2026-10-05T08:00:00.000Z',
    updatedAt: '2026-10-05T08:30:00.000Z',
    updatedBy: { id: 'u2', name: 'Bastien' },
  };
}

function respond(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function serve(listing: FolderListing) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return respond({ item: item('folder', 'n', 'Nouveau') }, 201);
    if (init?.method === 'DELETE') return respond(null, 204);
    if (String(input).includes('/dossiers'))
      return respond({ folders: [{ id: 'f1', name: 'Projets', parentId: null }] });
    return respond(listing);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const root: FolderListing = {
  folder: null,
  path: [],
  items: [item('folder', 'f1', 'Projets'), item('text', 'd1', 'Charte')],
  canEdit: true,
};

describe('Espace documentaire', () => {
  beforeEach(() => vi.mocked(useCurrentUser).mockReturnValue({ user: editor, pending: false }));
  afterEach(() => vi.unstubAllGlobals());

  it('liste dossiers et documents avec la dernière modification', async () => {
    serve(root);
    render(<Documents folderId={null} />);
    expect(await screen.findByRole('link', { name: 'Projets' })).toHaveAttribute(
      'href',
      '/documents/dossiers/f1',
    );
    expect(screen.getByRole('link', { name: 'Charte' })).toHaveAttribute('href', '/documents/d1');
    expect(screen.getAllByText('Bastien')).toHaveLength(2);
    expect(screen.getAllByText(/5 oct\. 2026/)).toHaveLength(2);
  });

  it('crée un dossier dans le dossier ouvert', async () => {
    const fetchMock = serve({
      ...root,
      folder: item('folder', 'f1', 'Projets'),
      path: [{ id: 'f1', name: 'Projets' }],
    });
    render(<Documents folderId="f1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau dossier' }));
    fireEvent.change(screen.getByLabelText(/Nom/), { target: { value: '  Archives ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/documents',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ kind: 'folder', name: 'Archives', parentId: 'f1' }),
        }),
      ),
    );
  });

  it('refuse un nom invalide avant l’envoi', async () => {
    const fetchMock = serve(root);
    render(<Documents folderId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau document' }));
    fireEvent.change(screen.getByLabelText(/Nom/), { target: { value: 'a/b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('/');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/documents',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('demande confirmation avant de supprimer', async () => {
    const fetchMock = serve(root);
    render(<Documents folderId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Projets' }));
    const panel = screen.getByRole('region', { name: 'Supprimer « Projets » ?' });
    expect(panel).toHaveTextContent('tout ce qu’il contient');
    fireEvent.click(within(panel).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/documents/f1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('n’offre aucune modification à un lecteur', async () => {
    serve({ ...root, canEdit: false });
    render(<Documents folderId={null} />);
    await screen.findByRole('link', { name: 'Projets' });
    expect(screen.queryByRole('button', { name: 'Nouveau document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
  });

  it('dit quand un dossier est vide', async () => {
    serve({
      folder: item('folder', 'f1', 'Projets'),
      path: [{ id: 'f1', name: 'Projets' }],
      items: [],
      canEdit: true,
    });
    render(<Documents folderId="f1" />);
    expect(await screen.findByText('Ce dossier est vide.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).toHaveTextContent('Projets');
  });
});
