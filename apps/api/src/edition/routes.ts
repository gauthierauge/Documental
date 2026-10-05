import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Deps } from '@/app';
import { requireUser, type SessionUser } from '@/auth/middleware';
import { EditionError, EditionStore } from '@/edition/store';
import type { DocumentContent, OperationsSince } from '@documental/contracts/edition';
import { isValidOperation, type TextOperation } from '@documental/contracts/text-operation';

const EDITORS = ['admin', 'editeur'] as const;

const submissionBody = z
  .object({
    id: z.string().min(8).max(64),
    base: z.number().int().min(0),
    operation: z.custom<TextOperation>(isValidOperation, 'Modification invalide'),
  })
  .strict();

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
  const app = new Hono();

  app.use('*', requireUser());

  app.get('/:id/contenu', async (c) => {
    const found = await store.content(c.req.param('id'));
    if (!found) throw new HTTPException(404, { message: 'Document introuvable' });
    const result: DocumentContent = {
      ...found,
      canEdit: (EDITORS as readonly string[]).includes(currentUser(c).role),
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

  app.post('/:id/operations', requireUser(...EDITORS), async (c) => {
    const submission = parse(submissionBody, await readJson(c.req.raw));
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
