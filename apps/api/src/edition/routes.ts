import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Deps } from '@/app';
import { requireUser, type SessionUser } from '@/auth/middleware';
import { type Connection, EDITORS, EditionHub, submissionSchema } from '@/edition/hub';
import { EditionError, EditionStore } from '@/edition/store';
import type { DocumentContent, OperationsSince } from '@documental/contracts/edition';

const sinceQuery = z.object({ depuis: z.coerce.number().int().min(0) });

function currentUser(c: { get(key: 'user'): SessionUser | null }): SessionUser {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Connexion requise' });
  return user;
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? 'Requête invalide',
    });
  }
  return parsed.data;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HTTPException(400, { message: 'Corps JSON invalide' });
  }
}

export function editionRoutes(deps: Deps) {
  const store = new EditionStore(deps.db);
  const hub = new EditionHub(store, deps.listen);
  const app = new Hono();
  const allowedOrigin = new URL(deps.env.APP_URL).origin;

  const live: MiddlewareHandler = deps.upgradeWebSocket
    ? deps.upgradeWebSocket((c) => {
        const user = currentUser(c);
        const documentId = c.req.param('id') ?? '';
        const since = Number(c.req.query('depuis'));
        let connection: Connection | null = null;
        return {
          onOpen(_event, ws) {
            connection = {
              user,
              send(message) {
                if (ws.readyState === 1) ws.send(JSON.stringify(message));
              },
              close(code, reason) {
                ws.close(code, reason);
              },
            };
            hub.join(documentId, connection, since).catch(() => ws.close(1011, 'Erreur interne'));
          },
          onMessage(event, ws) {
            if (!connection) return;
            if (typeof event.data !== 'string') {
              ws.close(1003, 'Texte attendu');
              return;
            }
            hub
              .receive(documentId, connection, event.data)
              .catch(() => ws.close(1011, 'Erreur interne'));
          },
          onClose() {
            if (connection) hub.leave(documentId, connection);
          },
        };
      })
    : async (c) => c.json({ error: 'WebSocket attendu' }, 426);

  app.use('*', requireUser());

  app.get('/:id/contenu', async (c) => {
    const found = await store.content(c.req.param('id'));
    if (!found) throw new HTTPException(404, { message: 'Document introuvable' });
    const result: DocumentContent = {
      ...found,
      canEdit: EDITORS.includes(currentUser(c).role),
    };
    return c.json(result);
  });

  app.get('/:id/operations', async (c) => {
    const { depuis } = parse(sinceQuery, c.req.query());
    if (!(await store.content(c.req.param('id')))) {
      throw new HTTPException(404, { message: 'Document introuvable' });
    }
    const result: OperationsSince = { operations: await store.since(c.req.param('id'), depuis) };
    return c.json(result);
  });

  app.get(
    '/:id/direct',
    async (c, next) => {
      if (c.req.header('origin') !== allowedOrigin) {
        throw new HTTPException(403, { message: 'Origine refusée' });
      }
      const { depuis } = parse(sinceQuery, c.req.query());
      const found = await store.content(c.req.param('id'));
      if (!found) throw new HTTPException(404, { message: 'Document introuvable' });
      if (depuis > found.revision) {
        throw new HTTPException(409, { message: 'Version inconnue : rechargez le document.' });
      }
      await next();
    },
    live,
  );

  app.post('/:id/operations', requireUser('admin', 'editeur'), async (c) => {
    const submission = parse(submissionSchema, await readJson(c.req.raw));
    try {
      return c.json(await store.submit(c.req.param('id'), submission, currentUser(c).id));
    } catch (error) {
      if (error instanceof EditionError) {
        throw new HTTPException(error.status, { message: error.message });
      }
      throw error;
    }
  });

  return app;
}
