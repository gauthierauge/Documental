import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export const dialect = 'pg' as const;

export function databaseUrl(env: { DATABASE_URL?: string | undefined }): string {
  return env.DATABASE_URL ?? 'pglite://./data/pglite';
}

export type Listen = (
  channel: string,
  onPayload: (payload: string) => void,
) => Promise<() => Promise<void>>;

export interface Database {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
  listen: Listen;
}

const migrationsFolder = './drizzle';

export interface OpenOptions {
  pgliteImage?: Blob;
}

export async function openDatabase(url: string, options: OpenOptions = {}): Promise<Database> {
  if (url.startsWith('pglite://')) {
    const path = url.slice('pglite://'.length);
    if (path !== 'memory') mkdirSync(path, { recursive: true });
    const client = new PGlite({
      ...(path === 'memory' ? {} : { dataDir: path }),
      ...(options.pgliteImage ? { loadDataDir: options.pgliteImage } : {}),
    });
    const db = drizzlePglite({ client, schema, casing: 'snake_case' });
    return {
      db,
      migrate: () => migratePglite(db, { migrationsFolder }),
      close: () => client.close(),
      listen: (channel, onPayload) => client.listen(channel, onPayload),
    };
  }
  const client = postgres(url, { max: 10 });
  const db = drizzlePostgres({ client, schema, casing: 'snake_case' });
  return {
    db,
    migrate: () => migratePostgres(db, { migrationsFolder }),
    close: () => client.end(),
    listen: async (channel, onPayload) => {
      const { unlisten } = await client.listen(channel, onPayload);
      return unlisten;
    },
  };
}

export async function ping(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
