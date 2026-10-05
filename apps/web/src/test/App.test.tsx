import { render, screen, within } from '@testing-library/react';
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

  it('affiche la coquille et, en développement, la page Démarrage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/demarrage')
          ? respond({ environnement: 'development' })
          : respond({ ok: true }),
      ),
    );
    render(<App />);
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute(
      'href',
      '#contenu',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenu');
    expect(await screen.findByRole('heading', { level: 1, name: 'Démarrage' })).toBeInTheDocument();
    const api = await screen.findByRole('region', { name: 'API' });
    expect(await within(api).findByText('En marche')).toBeInTheDocument();
    expect(await screen.findByText('development')).toBeInTheDocument();
  });

  it('signale une API injoignable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({}, 503)),
    );
    render(<App />);
    const api = await screen.findByRole('region', { name: 'API' });
    expect(await within(api).findByText('Injoignable')).toBeInTheDocument();
  });

  it('répond « Page introuvable » sur une adresse inconnue', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({ ok: true })),
    );
    window.history.pushState(null, '', '/nulle-part');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revenir à l’accueil' })).toHaveAttribute('href', '/');
  });
});
