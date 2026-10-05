import { render, screen, waitFor } from '@testing-library/react';
import { App } from '@/App';

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState(null, '', '/');
  });

  it('affiche la coquille et mène de / aux documents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({ ok: true })),
    );
    render(<App />);
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute(
      'href',
      '#contenu',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenu');
    expect(screen.queryByRole('link', { name: 'Accueil' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/documents');
    await waitFor(() => expect(window.location.pathname).not.toBe('/'));
  });

  it('répond « Page introuvable » sur une adresse inconnue', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({ ok: true })),
    );
    window.history.pushState(null, '', '/nulle-part');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revenir aux documents' })).toHaveAttribute(
      'href',
      '/documents',
    );
  });
});
