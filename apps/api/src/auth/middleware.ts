import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Auth, Role } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionUser | null;
  }
}

export function loadSession(auth: Auth) {
  return createMiddleware(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    const u = result?.user as (SessionUser & Record<string, unknown>) | undefined;
    const active = u && !u.blockedAt;
    c.set('user', active ? { id: u.id, email: u.email, name: u.name, role: u.role } : null);
    await next();
  });
}

export function requireUser(...roles: Role[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'Connexion requise' });
    if (roles.length && !roles.includes(user.role)) {
      throw new HTTPException(403, { message: 'Accès refusé' });
    }
    await next();
  });
}
