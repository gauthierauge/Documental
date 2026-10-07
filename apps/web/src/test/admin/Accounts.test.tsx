import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Accounts } from '@/admin/Accounts';
import { type AdminMeta, MetaContext } from '@/admin/meta';

const meta: AdminMeta = {
  user: {
    id: 'u1',
    email: 'claire@exemple.fr',
    name: 'Claire',
    role: 'admin',
    roleLabel: 'Admin',
    strongFactor: true,
  },
  strongFactor: { label: 'Facteur fort', missing: 'Ajoutez un facteur fort', none: 'aucun' },
  access: { invited: 'Invitation envoyée à {email}.', resend: 'Renvoyer un lien' },
  sections: { accueil: true, comptes: true, exports: true, journal: true },
  entities: [],
  settings: [],
};

const accounts = [
  {
    id: 'u1',
    email: 'claire@exemple.fr',
    name: 'Claire',
    role: 'admin',
    strongFactor: 'Passkey',
    blockedAt: null,
  },
  {
    id: 'u2',
    email: 'paul@exemple.fr',
    name: 'Paul',
    role: 'editeur',
    strongFactor: null,
    blockedAt: null,
  },
  {
    id: 'u3',
    email: 'zoe@exemple.fr',
    name: 'Zoé',
    role: 'lecteur',
    strongFactor: null,
    blockedAt: '2026-10-05T10:00:00.000Z',
  },
];

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAccounts() {
  return render(
    <MetaContext.Provider value={meta}>
      <Accounts />
    </MetaContext.Provider>,
  );
}

describe('Comptes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('invite, change un rôle, renvoie un lien et retire un accès, jamais le sien', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method ? respond({ ok: true }) : respond({ accounts }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderAccounts();
    expect(await screen.findByText('paul@exemple.fr')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rôle de claire@exemple.fr' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Retirer l’accès' })).toHaveLength(2);
    expect(screen.getAllByText('aucun')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'lea@exemple.fr' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }));
    expect(await screen.findByText('Invitation envoyée à lea@exemple.fr.')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Rôle de paul@exemple.fr' }), {
      target: { value: 'lecteur' },
    });
    expect(await screen.findByText('Rôle modifié.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Renvoyer un lien' })[1] as HTMLElement);
    expect(await screen.findByText('Lien d’accès renvoyé à paul@exemple.fr.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer l’accès' })[0] as HTMLElement);
    expect(await screen.findByText('Accès retiré à paul@exemple.fr.')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).endsWith('/admin/comptes/u2') && init?.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });

  it('une invitation refusée dit pourquoi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method
          ? respond(
              { error: 'Invitation refusée', fields: { email: 'Ce compte existe déjà' } },
              409,
            )
          : respond({ accounts }),
      ),
    );
    renderAccounts();
    fireEvent.change(await screen.findByLabelText('Adresse e-mail'), {
      target: { value: 'paul@exemple.fr' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }));
    expect(await screen.findByText('Ce compte existe déjà')).toBeInTheDocument();
  });

  it('sans le facteur fort exigé, l’API refuse : la page le dit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({ error: 'Ajoutez un facteur fort' }, 403)),
    );
    renderAccounts();
    expect(await screen.findByText('Ajoutez un facteur fort')).toBeInTheDocument();
  });

  it('bloque et débloque un compte, jamais le sien', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method ? respond({ ok: true }) : respond({ accounts }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderAccounts();
    expect(await screen.findByText('Bloqué')).toBeInTheDocument();
    expect(screen.getAllByText('Actif')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Bloquer claire@exemple.fr' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Bloquer paul@exemple.fr' }));
    expect(
      await screen.findByText('paul@exemple.fr est bloqué : ses sessions sont fermées.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/comptes/u2/blocage',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ bloque: true }) }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Débloquer zoe@exemple.fr' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/comptes/u3/blocage',
        expect.objectContaining({ body: JSON.stringify({ bloque: false }) }),
      ),
    );
  });
});
