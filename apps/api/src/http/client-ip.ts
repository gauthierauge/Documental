import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';

export type TrustProxy = 'aucun' | 'cloudflare' | 'x-forwarded-for';

export interface ProxyPolicy {
  trust: TrustProxy;
  hops: number;
}

export const CLIENT_IP_HEADER = 'x-ip-client';

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

function normalize(ip: string): string {
  const lower = ip.toLowerCase();
  const mapped = lower.startsWith('::ffff:') ? lower.slice('::ffff:'.length) : '';
  return z.ipv4().safeParse(mapped).success ? mapped : lower;
}

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

function socketAddress(c: Context): string | undefined {
  const server = c.env as BunServer | undefined;
  return server?.requestIP?.(c.req.raw)?.address;
}

export function clientIp(policy: ProxyPolicy): MiddlewareHandler {
  return async (c, next) => {
    c.set('clientIp', resolveClientIp(c.req.raw.headers, socketAddress(c), policy));
    await next();
  };
}

export function withClientIp(c: Context): Request {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = c.get('clientIp');
  if (ip !== UNKNOWN_IP) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(c.req.raw, { headers });
}
