import { testApp } from '@/test/support/helpers';
import { Hono } from 'hono';
import {
  betterAuthStorage,
  betterAuthTooMany,
  memoryRateLimitStore,
  rateLimitKey,
  SlidingWindowLimiter,
} from '@/http/rate-limit';

const MINUTE = 60_000;

describe('limitation du débit', () => {
  it('refuse au-delà du maximum, avec le délai à attendre', () => {
    const limiter = new SlidingWindowLimiter(3, MINUTE);
    const start = 10 * MINUTE;
    expect([0, 1, 2].map((i) => limiter.hit('ip', start + i))).toEqual([0, 0, 0]);
    const wait = limiter.hit('ip', start + 3);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(MINUTE + MINUTE / 3);
    expect(limiter.hit('autre', start + 3)).toBe(0);
  });

  it('fenêtre glissante : la précédente compte encore au prorata', () => {
    const limiter = new SlidingWindowLimiter(10, MINUTE);
    const start = 10 * MINUTE;
    for (let i = 0; i < 10; i++) limiter.hit('ip', start + 50_000);
    expect(limiter.hit('ip', start + MINUTE + 1_000)).toBeGreaterThan(0);
    const half = start + MINUTE + MINUTE / 2;
    const passed = [0, 1, 2, 3, 4, 5].filter(() => limiter.hit('ip', half) === 0);
    expect(passed).toHaveLength(5);
  });

  it('une rafale à cheval sur la bascule : l’appel de trop est refusé, quelle que soit la répartition', () => {
    const boundary = 10 * MINUTE;
    for (let before = 0; before <= 5; before += 1) {
      const limiter = new SlidingWindowLimiter(5, MINUTE);
      const times = Array.from({ length: 6 }, (_, i) =>
        i < before ? boundary - 600 + i : boundary + 100 + i,
      );
      const waits = times.map((t) => limiter.hit('ip', t));
      expect(waits.slice(0, 5), `${before} avant la bascule`).toEqual([0, 0, 0, 0, 0]);
      expect(waits[5], `${before} avant la bascule`).toBeGreaterThan(0);
    }
  });

  it('le délai annoncé suffit : passé ce délai, l’appel passe', () => {
    const limiter = new SlidingWindowLimiter(5, MINUTE);
    const start = 10 * MINUTE;
    for (let i = 0; i < 5; i++) limiter.hit('ip', start + 40_000);
    const now = start + MINUTE + 15_000;
    expect(limiter.hit('ip', now)).toBe(0);
    const wait = limiter.hit('ip', now);
    expect(wait).toBeGreaterThan(0);
    expect(limiter.hit('ip', now + wait - 2)).toBeGreaterThan(0);
    expect(limiter.hit('ip', now + wait)).toBe(0);
  });

  it('un compteur plein attend la fenêtre suivante', () => {
    const limiter = new SlidingWindowLimiter(2, MINUTE);
    limiter.hit('ip', 0);
    limiter.hit('ip', 0);
    const wait = limiter.hit('ip', 0);
    expect(wait).toBeGreaterThan(MINUTE);
    expect(limiter.hit('ip', wait - 2)).toBeGreaterThan(0);
    expect(limiter.hit('ip', wait)).toBe(0);
  });

  it('oublie les adresses inactives', () => {
    const limiter = new SlidingWindowLimiter(5, MINUTE);
    limiter.hit('a', 0);
    limiter.hit('b', 3 * MINUTE);
    expect(limiter.size).toBe(1);
  });

  it('le stockage en mémoire : un compteur par clé et par règle', async () => {
    const store = memoryRateLimitStore();
    const strict = { max: 1, windowMs: MINUTE };
    const loose = { max: 5, windowMs: MINUTE };
    expect(await store.hit('api:ip', strict, 0)).toBe(0);
    expect(await store.hit('api:ip', strict, 1)).toBeGreaterThan(0);
    expect(await store.hit('api:ip', loose, 1)).toBe(0);
    expect(await store.hit('api:autre', strict, 1)).toBe(0);
  });

  it('Better Auth compte dans le même stockage, avec ses règles et son délai en secondes', async () => {
    const storage = betterAuthStorage(memoryRateLimitStore(), () => 0);
    const rule = { window: 10, max: 2 };
    expect(await storage.consume('203.0.113.1|/sign-in/email', rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(await storage.consume('203.0.113.1|/sign-in/email', rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    const refused = await storage.consume('203.0.113.1|/sign-in/email', rule);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThanOrEqual(10);
  });

  it('compte une IPv6 par /64', () => {
    expect(rateLimitKey('2001:db8:1:2:aaaa::1')).toBe(rateLimitKey('2001:db8:1:2:bbbb::2'));
    expect(rateLimitKey('2001:db8:1:3::1')).not.toBe(rateLimitKey('2001:db8:1:2::1'));
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('répond 429 au format du projet avec Retry-After, sans limiter /api/health', async () => {
    const { app } = await testApp({ env: { RATE_LIMIT_MAX: '2' } });
    await app.request('/api/nulle-part');
    await app.request('/api/nulle-part');
    const refused = await app.request('/api/nulle-part');
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await refused.text()).toMatch(/Trop de requêtes, réessayez dans \d+ minutes?\./);
    expect(refused.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await app.request('/api/health')).status).toBe(200);
  });

  it('réécrit le 429 de Better Auth au format du projet, avec son délai', async () => {
    const app = new Hono();
    app.use('/auth/*', betterAuthTooMany());
    app.post('/auth/sign-in', () =>
      Response.json(
        { message: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'X-Retry-After': '125' } },
      ),
    );
    app.post('/auth/sign-out', (c) => c.json({ ok: true }));
    const refused = await app.request('/auth/sign-in', { method: 'POST' });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('125');
    const body = await refused.text();
    expect(body).toContain('Connexion : trop de tentatives, réessayez dans 3 minutes.');
    expect(body).not.toContain('Too many requests');
    expect(await (await app.request('/auth/sign-out', { method: 'POST' })).json()).toEqual({
      ok: true,
    });
  });
});
