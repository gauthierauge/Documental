import { serveStatic } from 'hono/bun';
import { createApp } from './app';
import { readEnv } from './env';
import { drainServer, handleShutdownSignals, onShutdown } from './shutdown';
import { assertProduction } from './env-production';
import { databaseUrl, openDatabase } from './db/client';
import { createMailer } from './mail/mailer';

const env = readEnv();
// En production, une configuration incomplète arrête tout : tous les problèmes d'un coup.
if (env.NODE_ENV === 'production') assertProduction(env);
const database = await openDatabase(databaseUrl(env));
await database.migrate();
onShutdown(() => database.close());
const mailer = createMailer(env);
const app = createApp({ env, db: database.db, mailer });

if (env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: '../web/dist' }));
  // Le front est une application d'une seule page : toute adresse inconnue renvoie index.html,
  // sauf sous /api, où une route inconnue doit rester une 404 en JSON.
  const spa = serveStatic({ path: '../web/dist/index.html' });
  app.get('*', async (c, next) =>
    c.req.path.startsWith('/api/') ? c.json({ error: 'Introuvable' }, 404) : spa(c, next),
  );
}

const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
// Inscrit en dernier, donc exécuté en premier à l'arrêt : plus de nouvelles requêtes, celles en
// cours finissent, puis les ressources ouvertes plus haut sont fermées.
onShutdown(() => drainServer(server, env.SHUTDOWN_TIMEOUT_MS));
handleShutdownSignals(env.SHUTDOWN_TIMEOUT_MS);
console.info(`API prête sur http://localhost:${server.port}`);
