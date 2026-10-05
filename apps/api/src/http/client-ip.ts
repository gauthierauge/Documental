import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';

// L'adresse IP du visiteur sert à limiter le débit (ici et dans Better Auth). Derrière un proxy,
// la connexion TCP vient du proxy : l'adresse réelle est dans un en-tête qu'il a posé. Un
// en-tête n'est cru que si TRUST_PROXY le dit, sinon n'importe quel client pourrait en changer
// à chaque requête et échapper aux limites.

export type TrustProxy = 'aucun' | 'cloudflare' | 'x-forwarded-for';

export interface ProxyPolicy {
  trust: TrustProxy;
  /** Nombre de proxys de confiance devant le serveur (x-forwarded-for seulement). */
  hops: number;
}

/**
 * En-tête interne qui transmet l'adresse résolue à Better Auth (`advanced.ipAddress`). La
 * valeur éventuellement envoyée par le client est toujours remplacée.
 */
export const CLIENT_IP_HEADER = 'x-ip-client';

/** Hors de Bun.serve (tests), l'adresse de la connexion n'est pas connue. */
export const UNKNOWN_IP = 'inconnue';

declare module 'hono' {
  interface ContextVariableMap {
    clientIp: string;
  }
}

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

function isIp(value: string | undefined): value is string {
  return value !== undefined && ipSchema.safeParse(value).success;
}

/** `::ffff:203.0.113.7` (IPv4 vue par une socket IPv6) devient `203.0.113.7`. */
function normalize(ip: string): string {
  const lower = ip.toLowerCase();
  const mapped = lower.startsWith('::ffff:') ? lower.slice('::ffff:'.length) : '';
  return z.ipv4().safeParse(mapped).success ? mapped : lower;
}

/**
 * Chaque proxy ajoute à droite l'adresse qu'il voit. On remonte d'autant de cases qu'il y a de
 * proxys de confiance : ce qui est plus à gauche a pu être écrit par le client lui-même.
 */
function fromForwardedFor(value: string | null, hops: number): string | undefined {
  const chain = (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return chain[Math.max(0, chain.length - hops)];
}

function fromProxyHeader(headers: Headers, policy: ProxyPolicy): string | undefined {
  switch (policy.trust) {
    case 'cloudflare':
      return headers.get('cf-connecting-ip')?.trim();
    case 'x-forwarded-for':
      return fromForwardedFor(headers.get('x-forwarded-for'), policy.hops);
    case 'aucun':
      return undefined;
  }
}

/** L'adresse du visiteur : l'en-tête du proxy de confiance s'il est valide, sinon la connexion. */
export function resolveClientIp(
  headers: Headers,
  socket: string | undefined,
  policy: ProxyPolicy,
): string {
  const forwarded = fromProxyHeader(headers, policy);
  if (isIp(forwarded)) return normalize(forwarded);
  return isIp(socket) ? normalize(socket) : UNKNOWN_IP;
}

interface BunServer {
  requestIP?: (request: Request) => { address: string } | null;
}

/** L'adresse de la connexion TCP, donnée par Bun.serve (passé à Hono comme `c.env`). */
function socketAddress(c: Context): string | undefined {
  const server = c.env as BunServer | undefined;
  return server?.requestIP?.(c.req.raw)?.address;
}

/** Résout l'adresse une fois par requête : `c.get('clientIp')`. */
export function clientIp(policy: ProxyPolicy): MiddlewareHandler {
  return async (c, next) => {
    c.set('clientIp', resolveClientIp(c.req.raw.headers, socketAddress(c), policy));
    await next();
  };
}

/** La requête transmise à Better Auth, avec l'adresse résolue ici et rien d'autre. */
export function withClientIp(c: Context): Request {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = c.get('clientIp');
  if (ip !== UNKNOWN_IP) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(c.req.raw, { headers });
}
