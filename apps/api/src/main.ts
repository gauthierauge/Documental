import { serveStatic, upgradeWebSocket, websocket } from 'hono/bun';
import { createApp } from './app';
import { readEnv } from './env';
import { drainServer, handleShutdownSignals, onShutdown } from './shutdown';
import { assertProduction } from './env-production';
import { databaseUrl, openDatabase } from './db/client';
import { createMailer } from './mail/mailer';

const env = readEnv();
if (env.NODE_ENV === 'production') assertProduction(env);
const database = await openDatabase(databaseUrl(env));
await database.migrate();
onShutdown(() => database.close());
const mailer = createMailer(env);
const app = createApp({
  env,
  db: database.db,
  mailer,
  listen: database.listen,
  upgradeWebSocket,
});

if (env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: '../web/dist' }));
  const spa = serveStatic({ path: '../web/dist/index.html' });
  app.get('*', async (c, next) =>
    c.req.path.startsWith('/api/') ? c.json({ error: 'Introuvable' }, 404) : spa(c, next),
  );
}

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  websocket: { ...websocket, maxPayloadLength: 2 * 1024 * 1024 },
});
onShutdown(() => drainServer(server, env.SHUTDOWN_TIMEOUT_MS));
handleShutdownSignals(env.SHUTDOWN_TIMEOUT_MS);
console.info(`API prête sur http://localhost:${server.port}`);
