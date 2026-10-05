import { testDatabase } from '@/test/support/database';
import { eq } from 'drizzle-orm';
import { rateLimit } from '@/db/schema';
import { readEnv } from '@/env';
import { memoryRateLimitStore } from '@/http/rate-limit';
import { databaseRateLimitStore, rateLimitStore } from '@/http/rate-limit-store';

const MINUTE = 60_000;

describe('compteurs de débit dans la base', () => {
  it('refuse au-delà du maximum, avec le délai à attendre ; une autre clé a son compteur', async () => {
    const { db } = await testDatabase();
    const store = databaseRateLimitStore(db);
    const rule = { max: 3, windowMs: MINUTE };
    const start = 10 * MINUTE;
    for (let i = 0; i < 3; i += 1) expect(await store.hit('max:a', rule, start + i)).toBe(0);
    const wait = await store.hit('max:a', rule, start + 3);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(2 * MINUTE);
    expect(await store.hit('max:b', rule, start + 3)).toBe(0);
  });

  it('décide exactement comme les compteurs en mémoire, fenêtre glissante comprise', async () => {
    const { db } = await testDatabase();
    const inBase = databaseRateLimitStore(db);
    const inMemory = memoryRateLimitStore();
    const rule = { max: 5, windowMs: MINUTE };
    let now = 20 * MINUTE;
    for (let i = 0; i < 60; i += 1) {
      now += (i * 7_919) % 9_000;
      expect(await inBase.hit('pareil', rule, now), `appel ${i}`).toBe(
        await inMemory.hit('pareil', rule, now),
      );
    }
  });

  it('appels simultanés : exactement le maximum passe, même réparti sur deux instances', async () => {
    const { db } = await testDatabase();
    const first = databaseRateLimitStore(db);
    const second = databaseRateLimitStore(db);
    const rule = { max: 10, windowMs: MINUTE };
    const now = 30 * MINUTE;
    const waits = await Promise.all(
      Array.from({ length: 40 }, (_, i) => (i % 2 ? first : second).hit('simultanes', rule, now)),
    );
    expect(waits.filter((w) => w === 0)).toHaveLength(10);
  });

  it('appels simultanés juste après la bascule : la fenêtre précédente compte en appels entiers', async () => {
    const { db } = await testDatabase();
    const [first, second] = [databaseRateLimitStore(db), databaseRateLimitStore(db)];
    const rule = { max: 10, windowMs: MINUTE };
    const boundary = 60 * MINUTE;
    for (let i = 0; i < 4; i += 1)
      expect(await first.hit('bascule', rule, boundary - 100 + i)).toBe(0);
    // Les 4 appels d'il y a 100 ms pèsent encore 4 appels entiers : 6 de plus passent, pas 7.
    const waits = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? first : second).hit('bascule', rule, boundary + 100),
      ),
    );
    expect(waits.filter((w) => w === 0)).toHaveLength(6);
  });

  it('oublie les compteurs expirés, au plus une fois par minute', async () => {
    const { db } = await testDatabase();
    const store = databaseRateLimitStore(db);
    const rule = { max: 5, windowMs: MINUTE };
    await store.hit('purge:ancien', rule, 40 * MINUTE);
    await store.hit('purge:recent', rule, 43 * MINUTE);
    const rows = await db
      .select({ key: rateLimit.key })
      .from(rateLimit)
      .where(eq(rateLimit.key, 'purge:ancien'));
    expect(rows).toEqual([]);
    expect(await db.select().from(rateLimit).where(eq(rateLimit.key, 'purge:recent'))).toHaveLength(
      1,
    );
  });

  it('dans la base en fonctionnement, en mémoire pendant les tests', async () => {
    const { db } = await testDatabase();
    const rule = { max: 1, windowMs: MINUTE };
    const now = 50 * MINUTE;
    for (const NODE_ENV of ['production', 'development'] as const)
      await rateLimitStore({ env: readEnv({ NODE_ENV }), db }).hit(`choix:${NODE_ENV}`, rule, now);
    await rateLimitStore({ env: readEnv({ NODE_ENV: 'test' }), db }).hit('choix:test', rule, now);
    const keys = (await db.select({ key: rateLimit.key }).from(rateLimit)).map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['choix:production', 'choix:development']));
    expect(keys).not.toContain('choix:test');
  });
});
