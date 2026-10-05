// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { documentLink, SharePanel } from '@/invitations/SharePanel';

function respond(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function panel() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      respond({ owner: { id: 'u1', name: 'Alice' }, collaborators: [], canManage: true }),
    ),
  );
  render(
    <SharePanel documentId="d1" documentName="Charte" userId="u1" canWrite online={new Set()} />,
  );
  return screen.getByRole('button', { name: 'Partager' });
}

describe('Partager un document', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('donne le lien complet du document', () => {
    expect(documentLink('d 1')).toBe(`${window.location.origin}/documents/d%201`);
  });

  it('s’ouvre sous le bouton, puis se ferme avec Échap en rendant le focus', async () => {
    const button = panel();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Partager « Charte »' })).toBeVisible();
    expect(await screen.findByLabelText(/Inviter une personne/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('se ferme au clic en dehors', () => {
    const button = panel();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('copie le lien et le confirme', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(panel());
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    expect(await screen.findByText('Lien copié.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/documents/d1`);
  });

  it('propose de copier à la main si le presse-papiers refuse', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('refus'))) },
      configurable: true,
    });
    fireEvent.click(panel());
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    expect(await screen.findByText(/copiez-le à la main/)).toBeInTheDocument();
  });
});
