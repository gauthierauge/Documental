import { readEnv } from '@/env';
import { databaseUrl, openDatabase } from './client';

const env = readEnv();
const database = await openDatabase(databaseUrl(env));
await database.migrate();
await database.close();
console.info('Migrations appliquées');
