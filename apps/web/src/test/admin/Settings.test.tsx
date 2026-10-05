// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Settings } from '@/admin/Settings';

const settings = [
  { key: 'horaires', label: 'Horaires', type: 'horaires', public: true },
  { key: 'contact', label: 'E-mail de contact', type: 'email', public: false },
  { key: 'places', label: 'Places', type: 'nombre', public: false },
  { key: 'ouvert', label: 'Ouvert', type: 'oui_non', public: false },
];

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Réglages de l’app', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('enregistre les valeurs saisies ; une valeur refusée est dite à côté du champ', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'PUT')
        return respond({ settings, values: { horaires: 'Lundi : 7 h – 19 h' } });
      const values = JSON.parse(String(init.body)) as Record<string, unknown>;
      return values.contact === 'pas-une-adresse'
        ? respond(
            { error: 'Réglages invalides', fields: { contact: 'Adresse e-mail invalide' } },
            422,
          )
        : respond({ values });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Settings />);
    expect(await screen.findByDisplayValue('Lundi : 7 h – 19 h')).toBeInTheDocument();
    expect(screen.getByText(/visible publiquement/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('E-mail de contact'), {
      target: { value: 'pas-une-adresse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Adresse e-mail invalide')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('E-mail de contact'), {
      target: { value: 'contact@exemple.fr' },
    });
    fireEvent.change(screen.getByLabelText('Places'), { target: { value: '24' } });
    fireEvent.click(screen.getByLabelText('Ouvert'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Réglages enregistrés.')).toBeInTheDocument();
    await waitFor(() =>
      expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({
        horaires: 'Lundi : 7 h – 19 h',
        contact: 'contact@exemple.fr',
        places: 24,
        ouvert: true,
      }),
    );
  });
});
