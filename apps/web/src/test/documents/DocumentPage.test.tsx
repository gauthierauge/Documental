import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DocumentDetail } from '@documental/contracts/documents';
import { type CurrentUser, useCurrentUser } from '@/auth/client';
import { DocumentPage } from '@/documents/DocumentPage';

vi.mock('@/auth/client', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/invitations/SharePanel', () => ({ SharePanel: () => null }));

const { editeurs, texteInitial } = vi.hoisted(() => ({
  editeurs: [] as { onText?: (text: string) => void }[],
  texteInitial: { value: '# Titre\n\nUn texte.' },
}));

vi.mock('@/edition/Editor', async () => {
  const { useEffect } = await import('react');
  return {
    Editor: ({ onText, hidden }: { onText?: (text: string) => void; hidden?: boolean }) => {
      useEffect(() => {
        editeurs.push({ ...(onText ? { onText } : {}) });
        onText?.(texteInitial.value);
      }, [onText]);
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
});
