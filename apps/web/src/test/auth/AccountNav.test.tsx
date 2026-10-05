import { render, screen } from '@testing-library/react';
import { AccountNav } from '@/auth/AccountNav';
import { type CurrentUser, useCurrentUser } from '@/auth/client';

vi.mock('@/auth/client', () => ({ useCurrentUser: vi.fn() }));

function signedIn(user: CurrentUser | null) {
  vi.mocked(useCurrentUser).mockReturnValue({ user, pending: false });
}

describe('Navigation du compte', () => {
  it('propose la connexion à un visiteur', () => {
    signedIn(null);
    render(<AccountNav />);
    expect(screen.getByRole('link', { name: 'Connexion' })).toHaveAttribute('href', '/connexion');
  });

  it('mène au compte une fois connecté', () => {
    signedIn({
      id: 'u1',
      email: 'compte@exemple.fr',
      name: 'Compte',
      role: 'lecteur',
    } as CurrentUser);
    render(<AccountNav />);
    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveAttribute('href', '/compte');
  });
});
