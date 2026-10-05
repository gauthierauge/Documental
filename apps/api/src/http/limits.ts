import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';

function limitTo(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: 'Requête trop volumineuse' }, 413),
  });
}

export function bodyLimits(
  defaultBytes: number,
  byPath: Record<string, number>,
): MiddlewareHandler {
  const rules = Object.entries(byPath)
    .sort(([a], [b]) => b.length - a.length)
    .map(([prefix, bytes]) => ({ prefix, check: limitTo(bytes) }));
  const fallback = limitTo(defaultBytes);
  return (c, next) => {
    const rule = rules.find(({ prefix }) => c.req.path.startsWith(prefix));
    return (rule?.check ?? fallback)(c, next);
  };
}

export function requestTimeout(ms: number): MiddlewareHandler {
  return timeout(
    ms,
    () => new HTTPException(503, { message: 'Délai de traitement dépassé : réessayez' }),
  );
}
