// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Home } from '@/admin/Home';

describe('Accueil du panel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('une tuile par contenu, ce qui attend, et l’activité récente', async () => {
    const data = {
      cards: [
        {
          key: 'produits',
          label: 'Produits',
          total: 12,
          pending: { label: 'Brouillons', count: 3, field: 'statut' },
        },
      ],
      journal: [
        {
          id: 'j1',
          at: '2026-10-01T09:00:00.000Z',
          userEmail: 'claire@exemple.fr',
          summary: 'a publié',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(data))),
    );
    render(<Home />);
    const tile = await screen.findByRole('link', { name: /Produits/ });
    expect(tile).toHaveAttribute('href', '/admin/produits');
    expect(tile).toHaveTextContent('12');
    expect(screen.getByText('3 brouillons')).toBeInTheDocument();
    expect(screen.getByText(/a publié/)).toBeInTheDocument();
  });
});
