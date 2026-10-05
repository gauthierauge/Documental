import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Deps } from '@/app';
import {
  accessLink,
  hasStrongFactor,
  invitationProblem,
  sendAccessLink,
  strongFactor,
} from '@/auth/admin-access';
import type { Auth } from '@/auth/auth';
import { requireUser, type SessionUser } from '@/auth/middleware';
import { adminConfig } from '@documental/contracts/admin.config';
import {
  type Action,
  allowedActions,
  type EntityConfig,
  ROLE_LABEL,
  type Role,
} from '@documental/contracts/admin-types';
import { AuditLog, diff } from './audit';
import { toCsv } from './csv';
import { SettingsStore } from './settings';
import { ContentStore } from './store';
import { Accounts } from './users';
import { entitySchemas, fieldErrors, settingsSchema } from './validation';

function currentUser(c: { get(key: 'user'): SessionUser | null }): SessionUser {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Connexion requise' });
  return user;
}

function entityOr404(key: string): EntityConfig {
  const entity = adminConfig.entities.find((e) => e.key === key);
  if (!entity) throw new HTTPException(404, { message: 'Contenu inconnu' });
  return entity;
}

function can(user: SessionUser, entity: EntityConfig, action: Action): void {
  if (!allowedActions(user.role, entity).includes(action)) {
    throw new HTTPException(403, { message: 'Action non permise pour votre rôle' });
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HTTPException(400, { message: 'Corps JSON invalide' });
  }
}

const listQuery = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  tri: z.string().max(60).optional(),
  ordre: z.enum(['asc', 'desc']).optional(),
  archives: z.enum(['0', '1']).optional(),
});

const inviteBody = z
  .object({
    email: z.email('Adresse e-mail invalide').transform((v) => v.trim().toLowerCase()),
    name: z.string().trim().max(120).optional(),
    role: z.enum(['admin', 'editeur', 'lecteur']),
  })
  .strict();

export function adminRoutes(deps: Deps, auth: Auth) {
  const store = new ContentStore(deps.db);
  const audit = new AuditLog(deps.db);
  const settings = new SettingsStore(deps.db, adminConfig.settings);
  const accounts = new Accounts(deps.db);

  const strongAdmin = createMiddleware(async (c, next) => {
    const user = currentUser(c);
    if (user.role !== 'admin') throw new HTTPException(403, { message: 'Réservé aux admins' });
    if (!(await hasStrongFactor(deps.db, user.id))) {
      return c.json({ error: strongFactor.missing, code: strongFactor.code }, 403);
    }
    await next();
  });

  const r = new Hono();
  r.use('*', requireUser('admin'));

  r.get('/meta', async (c) => {
    const user = currentUser(c);
    return c.json({
      user: {
        ...user,
        roleLabel: ROLE_LABEL[user.role],
        strongFactor: await hasStrongFactor(deps.db, user.id),
      },
      strongFactor: {
        label: strongFactor.label,
        missing: strongFactor.missing,
        none: strongFactor.none,
      },
      access: accessLink,
      sections: adminConfig.sections,
      entities: adminConfig.entities.map((e) => ({ ...e, allowed: allowedActions(user.role, e) })),
      settings: user.role === 'admin' ? adminConfig.settings : [],
    });
  });

  r.get('/accueil', async (c) => {
    const cards = [];
    for (const entity of adminConfig.entities) {
      const total = await store.count(entity);
      const list = entity.fields.find((f) => f.type === 'liste');
      const first = list?.options?.[0];
      const pending = list && first ? await store.count(entity, { [list.key]: first }) : null;
      cards.push({
        key: entity.key,
        label: entity.label,
        total,
        pending: pending === null ? null : { label: first, count: pending, field: list?.key },
      });
    }
    const journal = (await audit.list(1, 8)).rows;
    return c.json({ cards, journal });
  });

  r.get('/contenus/:entity', async (c) => {
    const user = currentUser(c);
    const entity = entityOr404(c.req.param('entity'));
    can(user, entity, 'lire');
    const query = listQuery.parse(c.req.query());
    const filters: Record<string, string> = {};
    for (const f of entity.fields) {
      const value = c.req.query(`f.${f.key}`);
      if (value) filters[f.key] = value;
    }
    const result = await store.list(entity, {
      ...(query.q ? { q: query.q } : {}),
      ...(query.page ? { page: query.page } : {}),
      ...(query.tri ? { sort: query.tri } : {}),
      ...(query.ordre ? { dir: query.ordre } : {}),
      archived: query.archives === '1',
      filters,
    });
    const labels: Record<string, Record<string, string>> = {};
    for (const f of entity.fields) {
      if (f.type !== 'lien' || !f.target) continue;
      const ids = [
        ...new Set(
          result.rows.map((row) => row[f.key]).filter((v): v is string => typeof v === 'string'),
        ),
      ];
      labels[f.key] = await store.labels(entityOr404(f.target), ids);
    }
    return c.json({ ...result, labels, perPage: 25 });
  });

  r.get('/contenus/:entity/export.csv', async (c) => {
    const user = currentUser(c);
    const entity = entityOr404(c.req.param('entity'));
    if (!adminConfig.sections.exports)
      throw new HTTPException(404, { message: 'Exports désactivés' });
    can(user, entity, 'exporter');
    const rows = await store.all(entity);
    const labels: Record<string, Record<string, string>> = {};
    for (const f of entity.fields) {
      if (f.type === 'lien' && f.target) {
        labels[f.key] = await store.labels(
          entityOr404(f.target),
          rows.map((row) => String(row[f.key] ?? '')).filter(Boolean),
        );
      }
    }
    await audit.record(user, {
      action: 'export',
      entity: entity.key,
      summary: `a exporté ${entity.label} (${rows.length} lignes)`,
    });
    const date = new Date().toISOString().slice(0, 10);
    return c.body(toCsv(entity, rows, labels), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${entity.key}-${date}.csv"`,
    });
  });

  r.get('/contenus/:entity/options', async (c) => {
    currentUser(c);
    return c.json(await store.options(entityOr404(c.req.param('entity'))));
  });

  r.get('/contenus/:entity/:id', async (c) => {
    const user = currentUser(c);
    const entity = entityOr404(c.req.param('entity'));
    can(user, entity, 'lire');
    const row = await store.get(entity, c.req.param('id'));
    if (!row) throw new HTTPException(404, { message: 'Introuvable' });
    const history = (await audit.list(1, 20, entity.key)).rows.filter((e) => e.entityId === row.id);
    return c.json({ row, history });
  });

  async function checkLinks(
    entity: EntityConfig,
    values: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};
    for (const f of entity.fields) {
      const value = values[f.key];
      if (
        f.type === 'lien' &&
        f.target &&
        typeof value === 'string' &&
        !(await store.exists(f.target, value))
      ) {
        errors[f.key] = `${f.label} : introuvable`;
      }
    }
    return errors;
  }

  r.post('/contenus/:entity', async (c) => {
    const user = currentUser(c);
    const entity = entityOr404(c.req.param('entity'));
    can(user, entity, 'creer');
    const parsed = entitySchemas(entity).create.safeParse(await readJson(c.req.raw));
    if (!parsed.success)
      return c.json({ error: 'Saisie invalide', fields: fieldErrors(parsed.error) }, 400);
    const values = parsed.data as Record<string, unknown>;
    const linkErrors = await checkLinks(entity, values);
    if (Object.keys(linkErrors).length)
      return c.json({ error: 'Saisie invalide', fields: linkErrors }, 400);
    const row = await store.create(entity, values);
    await audit.record(user, {
      action: 'creation',
      entity: entity.key,
      entityId: row.id,
      summary: `a créé une ligne dans ${entity.label}`,
      changes: values,
    });
    return c.json({ row }, 201);
  });

  r.patch('/contenus/:entity/:id', async (c) => {
    const user = currentUser(c);
    const entity = entityOr404(c.req.param('entity'));
    can(user, entity, 'modifier');
    const before = await store.get(entity, c.req.param('id'));
    if (!before) throw new HTTPException(404, { message: 'Introuvable' });
    const parsed = entitySchemas(entity).update.safeParse(await readJson(c.req.raw));
    if (!parsed.success)
      return c.json({ error: 'Saisie invalide', fields: fieldErrors(parsed.error) }, 400);
    const values = parsed.data as Record<string, unknown>;
    const linkErrors = await checkLinks(entity, values);
    if (Object.keys(linkErrors).length)
      return c.json({ error: 'Saisie invalide', fields: linkErrors }, 400);
    const row = await store.update(entity, before.id, values);
    const changes = diff(before, values);
    if (Object.keys(changes).length) {
      await audit.record(user, {
        action: 'modification',
        entity: entity.key,
        entityId: before.id,
        summary: `a modifié ${Object.keys(changes)
          .map((k) => entity.fields.find((f) => f.key === k)?.label ?? k)
          .join(', ')}`,
        changes,
      });
    }
    return c.json({ row });
  });

  for (const [path, archived] of [
    ['archiver', true],
    ['restaurer', false],
  ] as const) {
    r.post(`/contenus/:entity/:id/${path}`, async (c) => {
      const user = currentUser(c);
      const entity = entityOr404(c.req.param('entity'));
      can(user, entity, 'archiver');
      const row = await store.setArchived(entity, c.req.param('id'), archived);
      if (!row) throw new HTTPException(404, { message: 'Introuvable' });
      await audit.record(user, {
        action: archived ? 'archivage' : 'restauration',
        entity: entity.key,
        entityId: row.id,
        summary: `a ${archived ? 'archivé' : 'restauré'} une ligne de ${entity.label}`,
      });
      return c.json({ row });
    });
  }

  r.get('/reglages', strongAdmin, async (c) =>
    c.json({ settings: adminConfig.settings, values: await settings.all() }),
  );

  r.put('/reglages', strongAdmin, async (c) => {
    const user = currentUser(c);
    const parsed = settingsSchema(adminConfig.settings).safeParse(await readJson(c.req.raw));
    if (!parsed.success)
      return c.json({ error: 'Saisie invalide', fields: fieldErrors(parsed.error) }, 400);
    const before = await settings.all();
    await settings.set(parsed.data, user.id);
    const changes = diff(before, parsed.data);
    if (Object.keys(changes).length) {
      await audit.record(user, {
        action: 'reglages',
        entity: 'reglages',
        summary: `a modifié ${Object.keys(changes)
          .map((k) => adminConfig.settings.find((s) => s.key === k)?.label ?? k)
          .join(', ')}`,
        changes,
      });
    }
    return c.json({ values: await settings.all() });
  });

  if (adminConfig.sections.comptes) {
    r.get('/comptes', strongAdmin, async (c) => c.json({ accounts: await accounts.list() }));

    r.post('/comptes', strongAdmin, async (c) => {
      const user = currentUser(c);
      const parsed = inviteBody.safeParse(await readJson(c.req.raw));
      if (!parsed.success)
        return c.json({ error: 'Saisie invalide', fields: fieldErrors(parsed.error) }, 400);
      const { email, role } = parsed.data;
      if (await accounts.byEmail(email))
        return c.json({ error: 'Ce compte existe déjà', fields: { email: 'Déjà invité' } }, 409);
      const problem = invitationProblem(deps.env, email);
      if (problem) return c.json({ error: 'Saisie invalide', fields: { email: problem } }, 400);
      const created = await accounts.invite(
        email,
        parsed.data.name || email.split('@')[0] || email,
        role,
      );
      await sendAccessLink(auth, deps.env, email);
      await audit.record(user, {
        action: 'invitation',
        entity: 'comptes',
        entityId: created.id,
        summary: `a invité ${email} (${ROLE_LABEL[role]})`,
      });
      return c.json({ id: created.id }, 201);
    });

    if (accessLink.resend) {
      r.post('/comptes/:id/lien', strongAdmin, async (c) => {
        const target = await accounts.get(c.req.param('id'));
        if (!target) throw new HTTPException(404, { message: 'Compte introuvable' });
        await sendAccessLink(auth, deps.env, target.email);
        return c.json({ ok: true });
      });
    }

    r.patch('/comptes/:id', strongAdmin, async (c) => {
      const user = currentUser(c);
      const parsed = z
        .object({ role: z.enum(['admin', 'editeur', 'lecteur']) })
        .strict()
        .safeParse(await readJson(c.req.raw));
      if (!parsed.success) return c.json({ error: 'Rôle invalide' }, 400);
      const target = await accounts.get(c.req.param('id'));
      if (!target) throw new HTTPException(404, { message: 'Compte introuvable' });
      const role: Role = parsed.data.role;
      if (target.role === 'admin' && role !== 'admin' && (await accounts.adminCount()) <= 1) {
        return c.json({ error: 'Il faut au moins un admin' }, 409);
      }
      await accounts.setRole(target.id, role);
      await audit.record(user, {
        action: 'role',
        entity: 'comptes',
        entityId: target.id,
        summary: `a passé ${target.email} en ${ROLE_LABEL[role]}`,
      });
      return c.json({ ok: true });
    });

    r.delete('/comptes/:id', strongAdmin, async (c) => {
      const user = currentUser(c);
      const target = await accounts.get(c.req.param('id'));
      if (!target) throw new HTTPException(404, { message: 'Compte introuvable' });
      if (target.id === user.id)
        return c.json({ error: 'Impossible de retirer votre propre accès' }, 409);
      if (target.role === 'admin' && (await accounts.adminCount()) <= 1)
        return c.json({ error: 'Il faut au moins un admin' }, 409);
      await accounts.remove(target.id);
      await audit.record(user, {
        action: 'retrait',
        entity: 'comptes',
        entityId: target.id,
        summary: `a retiré l'accès de ${target.email}`,
      });
      return c.json({ ok: true });
    });
  }

  r.get('/journal', async (c) => {
    const page = Number(c.req.query('page') ?? 1) || 1;
    return c.json(await audit.list(page, 50));
  });

  return r;
}

export function publicSettingsRoute(deps: Pick<Deps, 'db'>) {
  const settings = new SettingsStore(deps.db, adminConfig.settings);
  const r = new Hono();
  r.get('/', async (c) => c.json(await settings.publicValues()));
  return r;
}
