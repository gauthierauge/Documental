import { readFileSync } from 'node:fs';
import { inject } from 'vitest';
import { type Database, openDatabase } from '@/db/client';

let database: Promise<Database> | null = null;

async function open(): Promise<Database> {
  const path = inject('pgliteImage');
  const db = await openDatabase(
    'pglite://memory',
    path ? { pgliteImage: new Blob([readFileSync(path)]) } : {},
  );
  await db.migrate();
  return db;
}

export function testDatabase(): Promise<Database> {
  database ??= open();
  return database;
}
