import { readEnv } from '@/env';
import { databaseUrl, openDatabase } from './client';

// Applique les migrations de ./drizzle. L'API le fait aussi à chaque démarrage.
const env = readEnv();
const database = await openDatabase(databaseUrl(env));
await database.migrate();
await database.close();
console.info('Migrations appliquées');
