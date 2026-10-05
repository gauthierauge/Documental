import type { Context, MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';

// Une ligne JSON par requête, lisible par n'importe quel hébergeur de journaux. Ni adresse IP,
// ni paramètres de requête, ni identifiants dans le chemin : seulement de quoi suivre le trafic
// et retrouver une erreur par son identifiant (en-tête X-Request-Id, renvoyé au client).

export type LogWriter = (line: string) => void;

/**
 * Le chemin journalisé. La route déclarée (`/api/admin/:id`) quand elle est précise ; sinon le
 * chemin réel où seuls les segments en minuscules et tirets (des noms de routes) sont gardés :
 * jetons, identifiants, e-mails et noms de fichiers deviennent `:param`.
 */
export function loggedPath(c: Context): string {
  const pattern = routePath(c);
  return pattern && !pattern.includes('*') ? pattern : maskedPath(c.req.path);
}

export function maskedPath(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment === '' || /^[a-z][a-z-]*$/.test(segment) ? segment : ':param'))
    .join('/');
}

export function requestLog(write: LogWriter): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    await next();
    write(
      JSON.stringify({
        heure: new Date().toISOString(),
        id: c.get('requestId'),
        methode: c.req.method,
        chemin: loggedPath(c),
        statut: c.res.status,
        duree_ms: Math.round(performance.now() - started),
      }),
    );
  };
}
