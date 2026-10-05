// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { Login } from '@/auth/Login';

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function signInWith(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('Écrans de connexion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState(null, '', '/');
  });

  it('un échec de connexion ne dit pas si le compte existe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respond({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401),
      ),
    );
    render(<Login />);
    signInWith('claire@exemple.fr', 'pas le bon mot de passe');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Adresse e-mail ou mot de passe incorrect.',
    );
  });

  it('un refus 429 dit quand réessayer', async () => {
    const message = 'Connexion : trop de tentatives, réessayez dans 1 minute.';
    // Le message sous les deux noms, `error` (Direct) et `detail` (Clean, DDD) : le test vaut partout.
    const refused = {
      type: '/problems/too-many-requests',
      title: 'Trop de requêtes',
      status: 429,
      error: message,
      detail: message,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(refused, 429)),
    );
    render(<Login />);
    signInWith('claire@exemple.fr', 'essai');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('demande le code de l’application quand la double authentification est active', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).includes('/sign-in/email')
        ? respond({ twoFactorRedirect: true, twoFactorMethods: ['totp'] })
        : respond({ code: 'INVALID_CODE', message: 'Invalid code' }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<Login />);
    signInWith('claire@exemple.fr', 'phrase-factice-pour-les-tests');
    fireEvent.change(await screen.findByLabelText('Code à 6 chiffres de votre application'), {
      target: { value: '123 456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect.');
    const verify = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/two-factor/verify-totp'),
    );
    expect(JSON.parse(String(verify?.[1]?.body))).toMatchObject({ code: '123456' });
  });
});
