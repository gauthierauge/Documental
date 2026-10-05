import { Hono } from 'hono';
import type { Deps } from '@/app';
import type { StartupState } from '@documental/contracts/startup';

export function startupRoutes(deps: Deps) {
  const routes = new Hono();

  routes.get('/', async (c) => {
    const state: StartupState = {
      environnement: deps.env.NODE_ENV,
      emails: deps.env.MAIL_PROVIDER,
    };
    return c.json(state);
  });

  return routes;
}
