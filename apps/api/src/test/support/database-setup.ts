import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { TestProject } from 'vitest/node';

// Démarrer PGlite (initdb en WebAssembly) coûte 2 à 3 s de calcul, trois à quatre fois plus sur
// une machine chargée. Payé par chaque fichier de test dans le délai de son premier test, il le
// faisait parfois dépasser. Il est fait une seule fois ici, avant les tests : la base migrée est
// enregistrée dans un fichier que chaque fichier de test recharge en quelques centaines de
// millisecondes (tests/database.ts). Chaque fichier garde sa propre base en mémoire.

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
