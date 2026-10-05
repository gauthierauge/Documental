import { fireEvent, render, screen } from '@testing-library/react';
import { SetPassword } from '@/auth/SetPassword';

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Écrans de connexion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState(null, '', '/');
  });

  it('applique les règles de mot de passe avant tout envoi', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      respond({ status: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState(null, '', '/mot-de-passe/nouveau?token=jeton-factice');
    render(<SetPassword />);
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'Motdepasse2026!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('premiers essayés');
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'une phrase factice assez longue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() => expect(window.location.pathname).toBe('/connexion'));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/reset-password');
  });
});
