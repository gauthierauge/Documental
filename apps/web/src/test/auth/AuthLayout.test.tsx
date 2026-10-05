import { render, screen } from '@testing-library/react';
import { AuthLayout, useRedirectWhenSignedIn } from '@/auth/AuthLayout';
import { type CurrentUser, useCurrentUser } from '@/auth/client';

vi.mock('@/auth/client', () => ({ useCurrentUser: vi.fn() }));

const claire = {
  id: 'u1',
  email: 'claire@exemple.fr',
  name: 'Claire',
  role: 'editeur',
} as CurrentUser;
const toDocuments = () => '/documents';

function Probe() {
  useRedirectWhenSignedIn(toDocuments);
  return <p>Formulaire</p>;
}

function as(user: CurrentUser | null, pending = false) {
  vi.mocked(useCurrentUser).mockReturnValue({ user, pending });
}

describe('Pages de connexion', () => {
  beforeEach(() => window.history.pushState(null, '', '/connexion'));

  it('affichent le nom de l’app et la page dans un cadre seul', () => {
    as(null);
    render(
      <AuthLayout title="Documental">
        <Probe />
      </AuthLayout>,
    );
    expect(screen.getByRole('main')).toHaveTextContent('Documental');
    expect(screen.getByText('Formulaire')).toBeInTheDocument();
  });

  it('restent sur place pour un visiteur ou pendant la vérification de la session', () => {
    as(null, true);
    render(<Probe />);
    as(null);
    render(<Probe />);
    expect(window.location.pathname).toBe('/connexion');
  });

  it('mènent aux documents quand on est déjà connecté, sans garder la page dans l’historique', () => {
    as(claire);
    const length = window.history.length;
    render(<Probe />);
    expect(window.location.pathname).toBe('/documents');
    expect(window.history.length).toBe(length);
  });
});
