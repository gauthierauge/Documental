import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Deps } from '@/app';
import { requireUser, type SessionUser } from '@/auth/middleware';
import { DocumentStore } from '@/documents/store';
import { InvitationStore } from '@/invitations/store';
import {
  canManageDocument,
  type CollaboratorList,
  type DocumentItem,
} from '@documental/contracts/documents';

const inviteBody = z.object({ userId: z.string().min(1).max(64) }).strict();
const searchQuery = z.object({ q: z.string().trim().min(2).max(100) });

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

export function invitationRoutes(deps: Deps) {
  const documents = new DocumentStore(deps.db);
  const invitations = new InvitationStore(deps.db);
  const app = new Hono();

  async function shareable(id: string): Promise<DocumentItem> {
    const item = await documents.get(id);
    if (!item) throw new HTTPException(404, { message: 'Document introuvable' });
    if (item.kind === 'folder') {
      throw new HTTPException(400, { message: 'On invite sur un document, pas sur un dossier.' });
    }
    return item;
  }

  function mustManage(user: SessionUser, item: DocumentItem): void {
    if (!canManageDocument(user, item)) {
      throw new HTTPException(403, {
        message: 'Seuls la personne qui a créé ce document et les admins peuvent inviter.',
      });
    }
  }

  app.use('*', requireUser());

  app.get('/:id/collaborateurs', async (c) => {
    const item = await shareable(c.req.param('id'));
    const result: CollaboratorList = {
      owner: item.createdBy,
      collaborators: await invitations.list(item.id),
      canManage: canManageDocument(currentUser(c), item),
    };
    return c.json(result);
  });

  app.get('/:id/invitables', async (c) => {
    const item = await shareable(c.req.param('id'));
    mustManage(currentUser(c), item);
    const { q } = parse(searchQuery, c.req.query());
    const excluded = (await invitations.list(item.id)).map((p) => p.id);
    if (item.createdBy) excluded.push(item.createdBy.id);
    return c.json({ accounts: await invitations.search(q, excluded) });
  });

  app.post('/:id/collaborateurs', async (c) => {
    const user = currentUser(c);
    const item = await shareable(c.req.param('id'));
    mustManage(user, item);
    const { userId } = parse(inviteBody, await readJson(c.req.raw));
    const invited = await invitations.account(userId);
    if (!invited) throw new HTTPException(404, { message: 'Compte introuvable' });
    if (invited.id === item.createdBy?.id) {
      throw new HTTPException(409, { message: 'Cette personne a créé le document.' });
    }
    if (!(await invitations.add(item.id, invited.id, user.id))) {
      throw new HTTPException(409, { message: 'Cette personne est déjà invitée.' });
    }
    let emailSent = true;
    try {
      await deps.mailer.send({
        to: invited.email,
        subject: `${user.name} vous invite à modifier « ${item.name} »`,
        text: [
          `Bonjour ${invited.name},`,
          '',
          `${user.name} vous invite à modifier le document « ${item.name} » sur Documental.`,
          '',
          `${new URL(`/documents/${item.id}`, deps.env.APP_URL).toString()}`,
        ].join('\n'),
      });
    } catch {
      emailSent = false;
    }
    return c.json({ collaborator: invited, emailSent }, 201);
  });

  app.delete('/:id/collaborateurs/:userId', async (c) => {
    const user = currentUser(c);
    const item = await shareable(c.req.param('id'));
    const target = c.req.param('userId');
    if (target !== user.id) mustManage(user, item);
    if (!(await invitations.remove(item.id, target))) {
      throw new HTTPException(404, { message: 'Cette personne n’est pas invitée.' });
    }
    return c.body(null, 204);
  });

  return app;
}
