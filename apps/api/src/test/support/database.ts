import { readFileSync } from 'node:fs';
import { inject } from 'vitest';
import { type Database, openDatabase } from '@/db/client';

// Une base en mémoire par fichier de test : migrée une fois, partagée par les tests du fichier.
// Chaque test utilise ses propres données (adresses, noms) pour rester indépendant.
// Elle part de l'image préparée une fois pour toute la suite (tests/database-setup.ts) : le
// démarrage de PGlite n'est plus payé par chaque fichier dans le délai de son premier test.
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
