import type { MiddlewareHandler } from 'hono';
import { expandIPv6 } from 'hono/utils/ipaddr';
import { tooManyRequests } from './too-many';

interface Window {
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
      window.previous = start - window.start === this.windowMs ? window.count : 0;
      window.count = 0;
      window.start = start;
    }
    return window;
  }

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
  count: number;
  previous: number;
  elapsed: number;
}

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

export interface RateLimitStore {
  hit(key: string, rule: RateLimitRule, now: number): Promise<number>;
}

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

export function rateLimitKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  return `${expandIPv6(ip).split(':').slice(0, 4).join(':')}::/64`;
}

export interface RateLimitOptions {
  store: RateLimitStore;
  max: number;
  windowS: number;
  except: string[];
  now?: () => number;
}

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

export function betterAuthTooMany(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status !== 429) return;
    const seconds = Number(c.res.headers.get('x-retry-after'));
    const waitMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000;
    c.res = tooManyRequests(waitMs, 'Connexion : trop de tentatives');
  };
}
