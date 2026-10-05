import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DocumentDetail } from '@documental/contracts/documents';
import { type CurrentUser, useCurrentUser } from '@/auth/client';
import { DocumentPage } from '@/documents/DocumentPage';

vi.mock('@/auth/client', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/invitations/SharePanel', () => ({ SharePanel: () => null }));

interface FauxEditeur {
  onText?: (text: string) => void;
  onFiles?: (files: File[]) => void;
}

const { editeurs, insertions, texteInitial } = vi.hoisted(() => ({
  editeurs: [] as FauxEditeur[],
  insertions: [] as string[],
  texteInitial: { value: '# Titre\n\nUn texte.' },
}));

vi.mock('@/edition/Editor', async () => {
  const { useEffect } = await import('react');
  return {
    Editor: ({
      onText,
      onFiles,
      hidden,
      insert,
    }: FauxEditeur & { hidden?: boolean; insert?: { text: string; nonce: number } | null }) => {
      useEffect(() => {
        editeurs.push({ ...(onText ? { onText } : {}), ...(onFiles ? { onFiles } : {}) });
        onText?.(texteInitial.value);
      }, [onText, onFiles]);
      useEffect(() => {
        if (insert) insertions.push(insert.text);
      }, [insert]);
      return <textarea aria-label="Contenu du document" hidden={hidden} readOnly />;
    },
  };
});

const user = { id: 'u1', email: 'e@exemple.fr', name: 'Éa', role: 'editeur' } as CurrentUser;

const detail: DocumentDetail = {
  item: {
    id: 'd1',
    kind: 'text',
    name: 'Charte',
    parentId: null,
    createdAt: '2026-10-05T08:00:00.000Z',
    updatedAt: '2026-10-05T08:30:00.000Z',
    updatedBy: { id: 'u1', name: 'Éa' },
    createdBy: { id: 'u1', name: 'Éa' },
  },
  path: [{ id: 'd1', name: 'Charte' }],
  files: [],
  access: { write: true, manage: true },
};

function serve(body: DocumentDetail = detail) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

async function ouvrir() {
  render(<DocumentPage id="d1" />);
  await screen.findByRole('button', { name: 'Aperçu' });
}

describe('Page d’un document', () => {
  beforeEach(() => {
    editeurs.length = 0;
    insertions.length = 0;
    texteInitial.value = '# Titre\n\nUn texte.';
    vi.mocked(useCurrentUser).mockReturnValue({ user, pending: false });
    serve();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ouvre en rédaction, sans aperçu', async () => {
    await ouvrir();
    expect(screen.getByLabelText('Contenu du document')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Titre' })).toBeNull();
  });

  it('rend le Markdown en aperçu, et revient à la rédaction', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Titre' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rédiger' }));
    expect(screen.queryByRole('heading', { level: 2, name: 'Titre' })).toBeNull();
  });

  it('garde la zone de saisie montée sous l’aperçu', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    const zone = screen.getByLabelText('Contenu du document');
    expect(zone).toBeInTheDocument();
    expect(zone).not.toBeVisible();
  });

  it('reflète dans l’aperçu un texte arrivé après l’ouverture', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    editeurs[0]?.onText?.('## Ailleurs');
    expect(await screen.findByRole('heading', { level: 3, name: 'Ailleurs' })).toBeInTheDocument();
  });

  it('prévient quand il n’y a rien à prévisualiser', async () => {
    texteInitial.value = '';
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    expect(screen.getByText('Ce document est vide.')).toBeInTheDocument();
  });

  it('affiche le HTML écrit par un rédacteur sans l’exécuter', async () => {
    texteInitial.value = '<img src=x onerror="alert(1)">';
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">/)).toBeInTheDocument();
  });

  it('n’offre pas la bascule sur autre chose qu’un document texte', async () => {
    serve({ ...detail, item: { ...detail.item, kind: 'file' } });
    render(<DocumentPage id="d1" />);
    await waitFor(() => expect(screen.getByText(/aperçu de ce fichier/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Aperçu' })).toBeNull();
  });

  it('envoie une image collée et insère sa référence dans le texte', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ file: { id: 'f9', name: 'schema.png' } }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(JSON.stringify(detail), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await ouvrir();

    const image = new File([new Uint8Array(4) as BlobPart], 'schema.png', { type: 'image/png' });
    editeurs[0]?.onFiles?.([image]);

    await waitFor(() => expect(insertions).toEqual(['\n![schema](/api/documents/fichiers/f9)\n']));
    const envoi = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST') as unknown as [
      string,
      RequestInit,
    ];
    expect(envoi[0]).toBe('/api/documents/fichiers/d1');
    expect((envoi[1].body as FormData).get('usage')).toBe('inline');
  });

  it('annonce l’échec d’un envoi sans rien insérer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(JSON.stringify({ error: 'Seule une image s’insère dans le texte.' }), {
              status: 415,
              headers: { 'content-type': 'application/json' },
            })
          : new Response(JSON.stringify(detail), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
      ),
    );
    await ouvrir();

    const image = new File([new Uint8Array(4) as BlobPart], 'schema.png', { type: 'image/png' });
    editeurs[0]?.onFiles?.([image]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Seule une image');
    expect(insertions).toEqual([]);
  });

  it('n’offre « Insérer une image » qu’en rédaction, et à qui peut écrire', async () => {
    await ouvrir();
    expect(screen.getByRole('button', { name: 'Insérer une image' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    expect(screen.queryByRole('button', { name: 'Insérer une image' })).toBeNull();
  });

  it('cache « Insérer une image » à un lecteur', async () => {
    serve({ ...detail, access: { write: false, manage: false } });
    render(<DocumentPage id="d1" />);
    await screen.findByRole('button', { name: 'Aperçu' });
    expect(screen.queryByRole('button', { name: 'Insérer une image' })).toBeNull();
  });
});
