import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Deps } from '@/app';
import { requireUser, type SessionUser } from '@/auth/middleware';
import { DocumentStore, NameTakenError } from '@/documents/store';
import {
  type DocumentDetail,
  documentNameProblem,
  type FolderListing,
  normalizeDocumentName,
} from '@documental/contracts/documents';

const EDITORS = ['admin', 'editeur'] as const;

const id = z.string().min(1).max(64);

const name = z
  .string()
  .max(500)
  .transform(normalizeDocumentName)
  .superRefine((value, ctx) => {
    const problem = documentNameProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

const createBody = z
  .object({
    kind: z.enum(['folder', 'text']),
    name,
    parentId: id.nullable().default(null),
  })
  .strict();

const updateBody = z
  .object({
    name: name.optional(),
    parentId: id.nullable().optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.parentId !== undefined, {
    message: 'Rien à modifier',
  });

const listQuery = z.object({ dossier: id.optional() });

function currentUser(c: { get(key: 'user'): SessionUser | null }): SessionUser {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Connexion requise' });
  return user;
}

function canEdit(user: SessionUser): boolean {
  return (EDITORS as readonly string[]).includes(user.role);
}

async function parse<T extends z.ZodType>(schema: T, input: unknown): Promise<z.infer<T>> {
  const parsed = await schema.safeParseAsync(input);
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

function nameTaken(error: unknown): never {
  if (error instanceof NameTakenError) throw new HTTPException(409, { message: error.message });
  throw error;
}

export function documentRoutes(deps: Deps) {
  const store = new DocumentStore(deps.db);
  const app = new Hono();

  async function folderOr404(folderId: string | null) {
    if (!folderId) return null;
    const folder = await store.get(folderId);
    if (folder?.kind !== 'folder') {
      throw new HTTPException(404, { message: 'Dossier introuvable' });
    }
    return folder;
  }

  app.use('*', requireUser());

  app.get('/', async (c) => {
    const { dossier } = await parse(listQuery, c.req.query());
    const folder = await folderOr404(dossier ?? null);
    const listing: FolderListing = {
      folder,
      path: await store.path(folder?.id ?? null),
      items: await store.list(folder?.id ?? null),
      canEdit: canEdit(currentUser(c)),
    };
    return c.json(listing);
  });

  app.get('/dossiers', async (c) => c.json({ folders: await store.folders() }));

  app.get('/:id', async (c) => {
    const item = await store.get(c.req.param('id'));
    if (!item) throw new HTTPException(404, { message: 'Document introuvable' });
    const detail: DocumentDetail = {
      item,
      path: await store.path(item.id),
      canEdit: canEdit(currentUser(c)),
    };
    return c.json(detail);
  });

  app.post('/', requireUser(...EDITORS), async (c) => {
    const body = await parse(createBody, await readJson(c.req.raw));
    await folderOr404(body.parentId);
    const item = await store.create({ ...body, userId: currentUser(c).id }).catch(nameTaken);
    return c.json({ item }, 201);
  });

  app.patch('/:id', requireUser(...EDITORS), async (c) => {
    const body = await parse(updateBody, await readJson(c.req.raw));
    const existing = await store.get(c.req.param('id'));
    if (!existing) throw new HTTPException(404, { message: 'Document introuvable' });
    if (body.parentId !== undefined) {
      await folderOr404(body.parentId);
      if (await store.isInside(body.parentId, existing.id)) {
        throw new HTTPException(409, {
          message: 'Un dossier ne peut pas être déplacé dans lui-même.',
        });
      }
    }
    const item = await store.update(existing.id, body, currentUser(c).id).catch(nameTaken);
    return c.json({ item });
  });

  app.delete('/:id', requireUser(...EDITORS), async (c) => {
    if (!(await store.remove(c.req.param('id')))) {
      throw new HTTPException(404, { message: 'Document introuvable' });
    }
    return c.body(null, 204);
  });

  return app;
}
