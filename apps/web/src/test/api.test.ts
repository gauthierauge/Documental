import { ApiError, api } from '@/api';

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
  );

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rend le corps d’une réponse réussie', async () => {
    vi.stubGlobal('fetch', respond(200, { ok: true }));
    expect(await api('/health')).toEqual({ ok: true });
  });

  it('traduit une erreur avec le message de l’API', async () => {
    vi.stubGlobal('fetch', respond(400, { error: 'Titre obligatoire' }));
    await expect(api('/choses', { method: 'POST' })).rejects.toMatchObject({
      status: 400,
      message: 'Titre obligatoire',
    });
  });

  it('un refus 429 dit quand réessayer, d’après Retry-After', async () => {
    vi.stubGlobal('fetch', respond(429, {}, { 'retry-after': '120' }));
    const refused = await api('/choses').catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({
      status: 429,
      message: 'Trop de requêtes, réessayez dans 2 minutes.',
    });
  });
});

describe('Envoi d’un formulaire', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('laisse le navigateur poser le content-type et sa frontière', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const body = new FormData();
    body.set('fichier', new File([new Uint8Array([1])], 'a.pdf'));
    await api('/documents/fichiers/d1', { method: 'POST', body });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].headers).toEqual({});
  });
});
