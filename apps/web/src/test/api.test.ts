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
