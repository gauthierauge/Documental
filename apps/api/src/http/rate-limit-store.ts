import { lt, sql } from 'drizzle-orm';
import type { Deps } from '@/app';
import type { Db } from '@/db/client';
import { rateLimit } from '@/db/schema';
import { memoryRateLimitStore, type RateLimitStore, slidingWaitMs } from './rate-limit';

const PURGE_EVERY_MS = 60_000;

export function databaseRateLimitStore(db: Db): RateLimitStore {
  let lastPurge = 0;
  return {
    async hit(key, { max, windowMs }, now) {
      if (now - lastPurge >= PURGE_EVERY_MS) {
        lastPurge = now;
        await db.delete(rateLimit).where(lt(rateLimit.expiresAt, now));
      }
      const start = now - (now % windowMs);
      const elapsed = now - start;
      const expiresAt = start + 2 * windowMs;
      const previous = sql`case when ${rateLimit.windowStart} = ${start}::bigint then ${rateLimit.previous}
        when ${rateLimit.windowStart} = ${start - windowMs}::bigint then ${rateLimit.count} else 0 end`;
      const count = sql`case when ${rateLimit.windowStart} = ${start}::bigint then ${rateLimit.count} else 0 end`;
      const passes = sql`(${previous}) * ${1 - elapsed / windowMs}::double precision + (${count}) <= ${max - 1}::integer`;
      const [row] = await db
        .insert(rateLimit)
        .values({ key, windowStart: start, count: 1, previous: 0, allowed: true, expiresAt })
        .onConflictDoUpdate({
          target: rateLimit.key,
          set: {
            previous,
            count: sql`(${count}) + case when ${passes} then 1 else 0 end`,
            allowed: passes,
            windowStart: start,
            expiresAt,
          },
        })
        .returning({
          allowed: rateLimit.allowed,
          count: rateLimit.count,
          previous: rateLimit.previous,
        });
      if (!row || row.allowed) return 0;
      return slidingWaitMs({ max, windowMs, count: row.count, previous: row.previous, elapsed });
    },
  };
}

export function rateLimitStore(deps: Pick<Deps, 'env' | 'db'>): RateLimitStore {
  return deps.env.NODE_ENV === 'test' ? memoryRateLimitStore() : databaseRateLimitStore(deps.db);
}
