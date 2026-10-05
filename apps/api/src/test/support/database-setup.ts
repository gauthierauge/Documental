import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    pgliteImage?: string;
  }
}

export default async function setup(project: TestProject): Promise<() => void> {
  const dir = mkdtempSync(join(tmpdir(), 'pglite-tests-'));
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder: './drizzle' });
  const image = join(dir, 'base.tar');
  writeFileSync(image, new Uint8Array(await (await client.dumpDataDir('none')).arrayBuffer()));
  await client.close();
  project.provide('pgliteImage', image);
  return () => rmSync(dir, { recursive: true, force: true });
}
