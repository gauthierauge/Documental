import { testApp } from '@/test/support/helpers';
import { Hono } from 'hono';
import { bodyLimits, requestTimeout } from '@/http/limits';

function post(size: number): RequestInit {
  return { method: 'POST', body: 'x'.repeat(size), headers: { 'content-type': 'text/plain' } };
}

describe('bornes des requêtes', () => {
  it('refuse un corps trop gros en 413, en JSON', async () => {
    const { app } = await testApp({ env: { BODY_MAX_KB: '1' } });
    const response = await app.request('/api/nulle-part', post(1025));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Requête trop volumineuse' });
    // Juste à la limite : la requête passe (la suite dépend des modules : 404, 403…).
    expect((await app.request('/api/nulle-part', post(1024))).status).not.toBe(413);
  });

  it('mesure aussi un corps envoyé sans Content-Length', async () => {
    const app = new Hono();
    app.use('*', bodyLimits(10, {}));
    app.post('/', async (c) => c.text(await c.req.text()));
    const stream = (text: string) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    const send = (text: string) =>
      app.request('/', { method: 'POST', body: stream(text), duplex: 'half' } as RequestInit);
    expect((await send('court')).status).toBe(200);
    expect((await send('beaucoup trop long')).status).toBe(413);
  });

  it('donne une autre limite aux routes déclarées, le préfixe le plus long l’emportant', async () => {
    const app = new Hono();
    app.use('*', bodyLimits(10, { '/gros/': 100, '/gros/petit': 5 }));
    app.post('*', (c) => c.text('ok'));
    expect((await app.request('/autre', post(50))).status).toBe(413);
    expect((await app.request('/gros/x', post(50))).status).toBe(200);
    expect((await app.request('/gros/petit', post(6))).status).toBe(413);
  });

  it('coupe une requête trop longue avec un 503 propre', async () => {
    const app = new Hono();
    app.use('*', requestTimeout(20));
    app.get('/lent', async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return c.text('trop tard');
    });
    app.onError((error, c) => c.json({ error: error.message }, 503));
    const response = await app.request('/lent');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Délai de traitement dépassé : réessayez' });
  });
});
