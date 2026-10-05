import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';

// Bornes de chaque requête : taille du corps et durée de traitement. Sans elles, un seul client
// peut occuper la mémoire ou les connexions du serveur.

function limitTo(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: 'Requête trop volumineuse' }, 413),
  });
}

/**
 * Taille maximale du corps, en octets. `byPath` donne une autre limite aux routes qui en ont
 * besoin (préfixe de chemin → octets) ; le préfixe le plus long l'emporte.
 */
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

/**
 * Délai maximal de traitement. Le client reçoit un 503 propre ; le traitement en cours n'est pas
 * interrompu (JavaScript ne sait pas l'arrêter), mais sa réponse est ignorée.
 */
export function requestTimeout(ms: number): MiddlewareHandler {
  return timeout(
    ms,
    () => new HTTPException(503, { message: 'Délai de traitement dépassé : réessayez' }),
  );
}
