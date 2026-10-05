import type { MiddlewareHandler } from 'hono';
import { expandIPv6 } from 'hono/utils/ipaddr';
import { tooManyRequests } from './too-many';

// Limitation du débit sur toute l'API, par adresse IP, en plus de celle de Better Auth sur la
// connexion. Fenêtre glissante approchée : le compteur de la fenêtre précédente compte au
// prorata du temps restant, ce qui évite la rafale permise à la bascule d'une fenêtre fixe,
// avec deux nombres par adresse seulement. Cette part est arrondie à l'appel entier supérieur :
// un appel ne sort pas de la fenêtre par fractions. Sans cet arrondi, juste après la bascule,
// `max` appels faits à la fin de la fenêtre précédente pèsent `max × (1 − ε)`, un peu moins que
// `max`, et l'appel de trop passe ; avec lui, une rafale plus courte que `durée / max` est
// toujours comptée en entier, de part et d'autre de la bascule. En contrepartie, une adresse
// qui a épuisé sa fenêtre attend jusqu'à `durée / max` de plus : on penche du côté prudent.
//
// Les compteurs vivent dans un RateLimitStore, le même pour toutes les limites (./rate-limit-store.ts) :
// en mémoire sans base, exact avec une seule instance ; dans la base quand le projet en a une,
// pour que plusieurs instances derrière un répartiteur comptent ensemble.

interface Window {
  /** Début de la fenêtre courante (multiple de la durée). */
  start: number;
  count: number;
  previous: number;
}

export class SlidingWindowLimiter {
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Compte un appel. Renvoie 0 s'il passe, sinon le délai d'attente en millisecondes. */
  hit(key: string, now: number): number {
    this.sweep(now);
    const window = this.current(key, now);
    const elapsed = now - window.start;
    const estimate = Math.ceil(window.previous * (1 - elapsed / this.windowMs)) + window.count;
    if (estimate >= this.max) {
      const { count, previous } = window;
      return slidingWaitMs({ max: this.max, windowMs: this.windowMs, count, previous, elapsed });
    }
    window.count += 1;
    return 0;
  }

  /** Nombre d'adresses suivies (pour les tests). */
  get size(): number {
    return this.windows.size;
  }

  private current(key: string, now: number): Window {
    const start = now - (now % this.windowMs);
    const window = this.windows.get(key);
    if (!window) {
      const fresh = { start, count: 0, previous: 0 };
      this.windows.set(key, fresh);
      return fresh;
    }
    if (window.start !== start) {
      // La fenêtre d'avant ne compte que si elle précède directement la nouvelle.
      window.previous = start - window.start === this.windowMs ? window.count : 0;
      window.count = 0;
      window.start = start;
    }
    return window;
  }

  /** Une fois par fenêtre, oublie les adresses inactives depuis deux fenêtres. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (now - window.start >= 2 * this.windowMs) this.windows.delete(key);
    }
  }
}

export interface SlidingWindow {
  max: number;
  windowMs: number;
  /** Appels comptés dans la fenêtre courante, et dans la précédente. */
  count: number;
  previous: number;
  /** Temps écoulé depuis le début de la fenêtre courante. */
  elapsed: number;
}

/**
 * Le temps, sans nouvel appel, avant que l'estimation repasse sous le maximum : dans la fenêtre
 * courante si la part de la précédente, arrondie à l'appel supérieur, peut descendre à
 * `max − 1 − count`, sinon dans la suivante, où la fenêtre courante devient la précédente.
 */
export function slidingWaitMs({
  max,
  windowMs: w,
  count,
  previous,
  elapsed,
}: SlidingWindow): number {
  if (count < max) return Math.max(1, w * (1 - (max - 1 - count) / previous) - elapsed + 1);
  return w - elapsed + w * (1 - (max - 1) / count) + 1;
}

export interface RateLimitRule {
  max: number;
  windowMs: number;
}

/** Où vivent les compteurs : chaque limite y préfixe ses clés (« api: », « strict: », « auth: »). */
export interface RateLimitStore {
  /** Compte un appel pour cette clé et cette règle. Renvoie 0 s'il passe, sinon le délai en ms. */
  hit(key: string, rule: RateLimitRule, now: number): Promise<number>;
}

/** Les compteurs dans la mémoire de ce processus : exact avec une seule instance. */
export function memoryRateLimitStore(): RateLimitStore {
  const limiters = new Map<string, SlidingWindowLimiter>();
  return {
    async hit(key, { max, windowMs }, now) {
      const rule = `${max}/${windowMs}`;
      let limiter = limiters.get(rule);
      if (!limiter) {
        limiter = new SlidingWindowLimiter(max, windowMs);
        limiters.set(rule, limiter);
      }
      return limiter.hit(key, now);
    },
  };
}

/**
 * Better Auth compte ses propres limites (connexion, réinitialisation…) dans le même stockage :
 * avec la base, ses compteurs sont aussi partagés entre les instances. Ses règles ne changent pas.
 */
export function betterAuthStorage(store: RateLimitStore, now: () => number = Date.now) {
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const waitMs = await store.hit(
        `auth:${key}`,
        { max: rule.max, windowMs: rule.window * 1000 },
        now(),
      );
      return { allowed: waitMs === 0, retryAfter: waitMs === 0 ? null : Math.ceil(waitMs / 1000) };
    },
  };
}

/** Une adresse IPv6 désigne souvent une seule machine dans un /64 : on compte par /64. */
export function rateLimitKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  return `${expandIPv6(ip).split(':').slice(0, 4).join(':')}::/64`;
}

export interface RateLimitOptions {
  store: RateLimitStore;
  max: number;
  windowS: number;
  /** Chemins jamais limités (la sonde de santé). */
  except: string[];
  now?: () => number;
}

/** 429 avec `Retry-After` (./too-many.ts) au-delà de `max` appels par fenêtre et par adresse. */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const rule = { max: options.max, windowMs: options.windowS * 1000 };
  const now = options.now ?? Date.now;
  return async (c, next) => {
    if (options.except.includes(c.req.path)) return next();
    const waitMs = await options.store.hit(`api:${rateLimitKey(c.get('clientIp'))}`, rule, now());
    if (waitMs > 0) return tooManyRequests(waitMs);
    await next();
  };
}

/**
 * Better Auth garde sa propre limite sur la connexion, et refuse avec `{ message }` et
 * `X-Retry-After`. Ce refus est réécrit au format du projet, avec le même délai : la limite
 * elle-même ne change pas.
 */
export function betterAuthTooMany(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status !== 429) return;
    const seconds = Number(c.res.headers.get('x-retry-after'));
    const waitMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000;
    c.res = tooManyRequests(waitMs, 'Connexion : trop de tentatives');
  };
}
