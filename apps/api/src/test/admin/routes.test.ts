import { INVITATION_LINK, lastInvitationLink, signInAs } from '@/test/support/auth-helpers';
import { testApp } from '@/test/support/helpers';
import { invitationProblem, strongFactor } from '@/auth/admin-access';
import { adminConfig } from '@documental/contracts/admin.config';
import { type EntityConfig, type FieldConfig } from '@documental/contracts/admin-types';

const ORIGIN = 'http://localhost:5173';
type App = Awaited<ReturnType<typeof testApp>>;

function signIn(t: App, role: 'admin' | 'editeur' | 'lecteur', strong = false): Promise<string> {
  return signInAs(t, role, { strong });
}

function call(
  t: App,
  cookie: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  return t.app.request(`/api/admin${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function sample(field: FieldConfig, n: number): unknown {
  switch (field.type) {
    case 'texte':
      return `${field.label} ${n}`;
    case 'texte_long':
      return `Texte ${n}`;
    case 'email':
      return `contact${n}@exemple.fr`;
    case 'telephone':
      return '04 93 00 00 00';
    case 'nombre':
      return 3;
    case 'montant':
      return 1250;
    case 'date':
      return '2026-10-03';
    case 'oui_non':
      return true;
    case 'liste':
      return field.options?.[0];
    case 'lien':
      return undefined;
  }
}

async function validValues(
  t: App,
  cookie: string,
  entity: EntityConfig,
  n: number,
): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const field of entity.fields) {
    if (field.type === 'lien') {
      if (!field.required) continue;
      const target = adminConfig.entities.find((e) => e.key === field.target);
      if (!target) continue;
      const created = await call(t, cookie, `/contenus/${target.key}`, {
        method: 'POST',
        body: await validValues(t, cookie, target, n),
      });
      values[field.key] = ((await created.json()) as { row: { id: string } }).row.id;
    } else values[field.key] = sample(field, n);
  }
  return values;
}

describe('Panel admin', () => {
  it('refuse les visiteurs non connectés', async () => {
    const t = await testApp();
    expect((await t.app.request('/api/admin/meta')).status).toBe(401);
  });

  it('réserve le panel aux admins', async () => {
    const t = await testApp();
    for (const role of ['editeur', 'lecteur'] as const) {
      const cookie = await signIn(t, role);
      for (const path of ['/meta', '/accueil', '/journal', '/comptes']) {
        expect((await call(t, cookie, path)).status).toBe(403);
      }
    }
    const admin = await signIn(t, 'admin', true);
    expect((await call(t, admin, '/meta')).status).toBe(200);
    expect((await call(t, admin, '/journal')).status).toBe(200);
  });

  for (const entity of adminConfig.entities) {
    describe(entity.label, () => {
      const creatable = entity.actions.includes('creer');

      it.runIf(creatable)('crée, retrouve, modifie, archive et restaure une ligne', async () => {
        const t = await testApp();
        const cookie = await signIn(t, 'editeur');
        const values = await validValues(t, cookie, entity, 1);
        const created = await call(t, cookie, `/contenus/${entity.key}`, {
          method: 'POST',
          body: values,
        });
        expect(created.status).toBe(201);
        const { row } = (await created.json()) as { row: { id: string } };

        const list = (await (await call(t, cookie, `/contenus/${entity.key}`)).json()) as {
          rows: { id: string }[];
        };
        expect(list.rows.some((r) => r.id === row.id)).toBe(true);

        if (entity.actions.includes('modifier')) {
          const field = entity.fields.find(
            (f) => f.type === 'texte' || f.type === 'nombre' || f.type === 'montant',
          );
          if (field) {
            const patched = await call(t, cookie, `/contenus/${entity.key}/${row.id}`, {
              method: 'PATCH',
              body: { [field.key]: sample(field, 2) },
            });
            expect(patched.status).toBe(200);
          }
        }

        if (entity.actions.includes('archiver')) {
          expect(
            (
              await call(t, cookie, `/contenus/${entity.key}/${row.id}/archiver`, {
                method: 'POST',
              })
            ).status,
          ).toBe(200);
          const active = (await (await call(t, cookie, `/contenus/${entity.key}`)).json()) as {
            rows: { id: string }[];
          };
          expect(active.rows.some((r) => r.id === row.id)).toBe(false);
          const archived = (await (
            await call(t, cookie, `/contenus/${entity.key}?archives=1`)
          ).json()) as { rows: { id: string }[] };
          expect(archived.rows.some((r) => r.id === row.id)).toBe(true);
          expect(
            (
              await call(t, cookie, `/contenus/${entity.key}/${row.id}/restaurer`, {
                method: 'POST',
              })
            ).status,
          ).toBe(200);
        }

        const journal = (await (await call(t, cookie, '/journal')).json()) as {
          rows: { entityId: string }[];
        };
        expect(journal.rows.some((e) => e.entityId === row.id)).toBe(true);
      });

      it.runIf(creatable)('refuse une saisie invalide avec un message par champ', async () => {
        const t = await testApp();
        const cookie = await signIn(t, 'editeur');
        const required = entity.fields.filter((f) => f.required);
        const response = await call(t, cookie, `/contenus/${entity.key}`, {
          method: 'POST',
          body: { champ_inconnu: 1 },
        });
        expect(response.status).toBe(400);
        const body = (await response.json()) as { fields: Record<string, string> };
        for (const f of required) expect(body.fields[f.key] ?? body.fields._).toBeTruthy();
      });

      it('refuse la création à un lecteur', async () => {
        const t = await testApp();
        const cookie = await signIn(t, 'lecteur');
        const response = await call(t, cookie, `/contenus/${entity.key}`, {
          method: 'POST',
          body: {},
        });
        expect(response.status).toBe(403);
      });

      it.runIf(adminConfig.sections.exports && entity.actions.includes('exporter'))(
        'exporte en CSV pour Excel',
        async () => {
          const t = await testApp();
          const cookie = await signIn(t, 'lecteur');
          const response = await call(t, cookie, `/contenus/${entity.key}/export.csv`);
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toContain('text/csv');
          const bytes = new Uint8Array(await response.arrayBuffer());
          expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
          expect(new TextDecoder().decode(bytes).startsWith('Identifiant;')).toBe(true);
        },
      );
    });
  }

  it.runIf(!strongFactor.delegated)(
    `exige un facteur fort (${strongFactor.label}) pour gérer les comptes et les réglages`,
    async () => {
      const t = await testApp();
      const sansFacteur = await signIn(t, 'admin');
      const response = await call(t, sansFacteur, '/reglages');
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: strongFactor.code });
      expect((await call(t, sansFacteur, '/comptes')).status).toBe(403);
      const meta = (await (await call(t, sansFacteur, '/meta')).json()) as {
        user: { strongFactor: boolean };
      };
      expect(meta.user.strongFactor).toBe(false);
      const avecFacteur = await signIn(t, 'admin', true);
      expect((await call(t, avecFacteur, '/reglages')).status).toBe(200);
    },
  );

  it.runIf(strongFactor.delegated)(
    `facteur fort délégué (${strongFactor.label}) : tout admin connecté gère les comptes et les réglages`,
    async () => {
      const t = await testApp();
      const admin = await signIn(t, 'admin');
      expect((await call(t, admin, '/reglages')).status).toBe(200);
      const meta = (await (await call(t, admin, '/meta')).json()) as {
        user: { strongFactor: boolean };
      };
      expect(meta.user.strongFactor).toBe(true);
    },
  );

  it.runIf(adminConfig.sections.comptes)(
    'invite un compte, change son rôle et retire son accès',
    async () => {
      const t = await testApp();
      const cookie = await signIn(t, 'admin', true);
      const email = `invite-${Date.now()}@exemple.fr`;
      const invited = await call(t, cookie, '/comptes', {
        method: 'POST',
        body: { email, role: 'editeur' },
      });
      expect(invited.status).toBe(201);
      if (INVITATION_LINK) expect(lastInvitationLink(t, email)).toContain(INVITATION_LINK);
      else expect(lastInvitationLink(t, email)).toBeNull();
      const { id } = (await invited.json()) as { id: string };
      const list = (await (await call(t, cookie, '/comptes')).json()) as {
        accounts: { id: string; strongFactor: string | null }[];
      };
      expect(list.accounts.find((a) => a.id === id)?.strongFactor).toBeNull();
      const self = (await (await call(t, cookie, '/meta')).json()) as { user: { id: string } };
      expect(list.accounts.find((a) => a.id === self.user.id)?.strongFactor).toBeTruthy();
      const outsider = 'quelquun@autre-domaine.invalid';
      const refused = await call(t, cookie, '/comptes', {
        method: 'POST',
        body: { email: outsider, role: 'lecteur' },
      });
      expect(refused.status).toBe(invitationProblem(t.deps.env, outsider) ? 400 : 201);
      expect(
        (await call(t, cookie, '/comptes', { method: 'POST', body: { email, role: 'lecteur' } }))
          .status,
      ).toBe(409);
      expect(
        (await call(t, cookie, `/comptes/${id}`, { method: 'PATCH', body: { role: 'lecteur' } }))
          .status,
      ).toBe(200);
      expect((await call(t, cookie, `/comptes/${id}`, { method: 'DELETE' })).status).toBe(200);
    },
  );

  it('refuse les comptes et les réglages à un éditeur', async () => {
    const t = await testApp();
    const cookie = await signIn(t, 'editeur', true);
    expect((await call(t, cookie, '/reglages')).status).toBe(403);
  });

  it.runIf(adminConfig.settings.length > 0)(
    'enregistre les réglages et expose seulement les publics',
    async () => {
      const t = await testApp();
      const cookie = await signIn(t, 'admin', true);
      const values: Record<string, unknown> = {};
      for (const s of adminConfig.settings) {
        values[s.key] =
          s.type === 'oui_non'
            ? true
            : s.type === 'nombre'
              ? 2
              : s.type === 'email'
                ? 'contact@exemple.fr'
                : `Valeur ${s.key}`;
      }
      expect((await call(t, cookie, '/reglages', { method: 'PUT', body: values })).status).toBe(
        200,
      );
      const pub = (await (await t.app.request('/api/reglages/publics')).json()) as Record<
        string,
        unknown
      >;
      for (const s of adminConfig.settings) {
        if (s.public) expect(pub[s.key]).toEqual(values[s.key]);
        else expect(pub).not.toHaveProperty(s.key);
      }
    },
  );
});
