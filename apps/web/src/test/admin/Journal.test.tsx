import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Journal } from '@/admin/Journal';

const entry = (i: number) => ({
  id: `j${i}`,
  at: '2026-10-01T09:00:00.000Z',
  userEmail: 'claire@exemple.fr',
  summary: `modification ${i}`,
});

describe('Journal d’activité', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('liste les modifications, page par page', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify({ rows: [entry(1)], total: 120 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<Journal />);
    expect(await screen.findByText(/modification 1/)).toBeInTheDocument();
    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('page=2'));
  });

  it('vide : le dit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ rows: [], total: 0 }))),
    );
    render(<Journal />);
    expect(await screen.findByText('Rien pour l’instant.')).toBeInTheDocument();
  });
});
