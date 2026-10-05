import type { Context, MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';

export type LogWriter = (line: string) => void;

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
