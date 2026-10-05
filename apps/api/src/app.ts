import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { Env } from './env';
import { clientIp } from './http/client-ip';
import { securityHeaders } from './http/headers';
import { bodyLimits, requestTimeout } from './http/limits';
import { rateLimit } from './http/rate-limit';
import { rateLimitStore } from './http/rate-limit-store';
import { type LogWriter, requestLog } from './http/request-log';
import { securityTxtHandler } from './http/security-txt';
import { startupRoutes } from './startup/routes';
import { type Db, type Listen, ping } from './db/client';
import type { UpgradeWebSocket } from 'hono/ws';
import type { Mailer } from './mail/mailer';
import { csrf } from 'hono/csrf';
import { createAuth } from './auth/auth';
import { loadSession, requireUser } from './auth/middleware';
import { withClientIp } from './http/client-ip';
import { betterAuthTooMany } from './http/rate-limit';
import { adminRoutes, publicSettingsRoute } from './admin/routes';
import { documentRoutes } from '@/documents/routes';
import { editionRoutes } from '@/edition/routes';
import { invitationRoutes } from '@/invitations/routes';

export interface Deps {
  env: Env;
  /** Où écrire le journal des requêtes ; par défaut le terminal, rien pendant les tests. */
  log?: LogWriter;
  db: Db;
  mailer: Mailer;
  listen: Listen;
  upgradeWebSocket?: UpgradeWebSocket;
}

function defaultLog(env: Env): LogWriter | undefined {
  return env.NODE_ENV === 'test' ? undefined : (line) => console.info(line);
}

// L'application est construite à partir de ses dépendances : les tests passent les leurs,
// sans serveur ni base réelle.
export function createApp(deps: Deps) {
  const app = new Hono();
  const { env } = deps;

  // Identifiant de requête (repris du proxy s'il est valide) puis journal : ils voient tout.
  app.use('*', requestId({ limitLength: 128 }));
  const log = deps.log ?? defaultLog(env);
  if (log) app.use('*', requestLog(log));
  app.use('*', clientIp({ trust: env.TRUST_PROXY, hops: env.TRUST_PROXY_HOPS }));

  app.use(
    '*',
    securityHeaders(env, {
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", new URL(env.APP_URL).origin.replace(/^http/, 'ws')],
        frameAncestors: ["'none'"],
      },
      crossOriginResourcePolicy: 'same-origin',
    }),
  );

  // Débit, durée et taille des requêtes de l'API (docs : .env.example). Les compteurs de toutes
  // les limites vivent au même endroit : en mémoire, ou dans la base si le projet en a une.
  const rateLimits = rateLimitStore(deps);
  app.use(
    '/api/*',
    rateLimit({
      store: rateLimits,
      max: env.RATE_LIMIT_MAX,
      windowS: env.RATE_LIMIT_WINDOW_S,
      except: ['/api/health'],
    }),
  );
  app.use('/api/*', requestTimeout(env.REQUEST_TIMEOUT_MS));
  // Les routes dont le corps a une autre taille maximale (préfixe → octets).
  const bodyLimitsByPath: Record<string, number> = { '/api/documents/': 2 * 1024 * 1024 };
  app.use('/api/*', bodyLimits(env.BODY_MAX_KB * 1024, bodyLimitsByPath));

  if (env.SECURITY_CONTACT) {
    app.get('/.well-known/security.txt', securityTxtHandler(env.SECURITY_CONTACT));
  }

  const api = new Hono();
  api.get('/health', (c) => c.json({ ok: true, env: env.NODE_ENV }));
  // Santé de la base : une vraie requête. Pour la supervision, sans rien révéler d'autre.
  api.get('/health/base', async (c) => {
    await ping(deps.db);
    return c.json({ ok: true });
  });
  const auth = createAuth(deps);
  api.use('*', csrf({ origin: deps.env.APP_URL }));
  // Le refus de la limite propre à Better Auth, au format du projet.
  api.use('/auth/*', betterAuthTooMany());
  api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(withClientIp(c)));
  api.use('*', loadSession(auth));
  api.get('/me', requireUser(), (c) => c.json({ user: c.get('user') }));
  api.route('/admin', adminRoutes(deps, auth));
  api.route('/reglages/publics', publicSettingsRoute(deps));
  api.route('/documents', documentRoutes(deps));
  api.route('/documents', editionRoutes(deps));
  api.route('/documents', invitationRoutes(deps));
  // Page « Démarrage » (état des modules) : en développement et en test seulement.
  if (deps.env.NODE_ENV !== 'production') api.route('/demarrage', startupRoutes(deps));

  app.route('/api', api);

  app.notFound((c) => c.json({ error: 'Introuvable' }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: 'Erreur interne' }, 500);
  });

  return app;
}
