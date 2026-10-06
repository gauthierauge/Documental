import type {
  CollaboratorList,
  DocumentItem,
  InvitableAccount,
} from '@documental/contracts/documents';
import type { MemoryMailer } from '@/mail/mailer';
import { createAccount, ORIGIN, signInAs } from '@/test/support/auth-helpers';
import { testApp } from '@/test/support/helpers';

type App = Awaited<ReturnType<typeof testApp>>;
type Person = { cookie: string; id: string };

let t: App;
let owner: Person;
let other: Person;
let reader: Person;
let admin: Person;
let counter = 0;

async function person(role: 'editeur' | 'lecteur' | 'admin', email: string): Promise<Person> {
  const cookie = await signInAs(t, role, { email });
  const response = await t.app.request('/api/me', { headers: { cookie } });
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, id: user.id };
}

beforeAll(async () => {
  t = await testApp();
  owner = await person('editeur', 'proprio@exemple.fr');
  other = await person('editeur', 'autre@exemple.fr');
  reader = await person('lecteur', 'lectrice@exemple.fr');
  admin = await person('admin', 'admin-invite@exemple.fr');
});

function call(cookie: string, path: string, init: { method?: string; body?: unknown } = {}) {
  return t.app.request(`/api/documents${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function newDocument(kind: 'text' | 'folder' = 'text'): Promise<string> {
  counter += 1;
  const response = await call(owner.cookie, '', {
    method: 'POST',
    body: { kind, name: `Partagé ${counter}`, parentId: null },
  });
  return ((await response.json()) as { item: DocumentItem }).item.id;
}

function invite(cookie: string, id: string, userId: string) {
  return call(cookie, `/${id}/collaborateurs`, { method: 'POST', body: { userId } });
}

function uninvite(cookie: string, id: string, userId: string) {
  return call(cookie, `/${id}/collaborateurs/${userId}`, { method: 'DELETE' });
}

function write(cookie: string, id: string, operation: (number | string)[], base = 0) {
  counter += 1;
  return call(cookie, `/${id}/operations`, {
    method: 'POST',
    body: { id: `invitation-${counter}`, base, operation },
  });
}

describe('Inviter une personne sur un document', () => {
  it('ne laisse écrire que le créateur tant que personne n’est invité', async () => {
    const id = await newDocument();
    expect((await write(other.cookie, id, ['non'])).status).toBe(403);
    expect((await write(owner.cookie, id, ['oui'])).status).toBe(200);
  });

  it('invite un compte : il peut écrire, il est prévenu par e-mail, le document lui est partagé', async () => {
    const id = await newDocument();
    const invited = await invite(owner.cookie, id, reader.id);
    expect(invited.status).toBe(201);
    expect(((await invited.json()) as { emailSent: boolean }).emailSent).toBe(true);

    const mailer = t.deps.mailer as MemoryMailer;
    const mail = mailer.sent.findLast((m) => m.to === 'lectrice@exemple.fr');
    expect(mail?.subject).toMatch(/vous invite à modifier « Partagé \d+ »/);
    expect(mail?.text).toContain(`http://localhost:5173/documents/${id}`);

    expect((await write(reader.cookie, id, ['écrit par la lectrice'])).status).toBe(200);
    const contenu = (await (await call(reader.cookie, `/${id}/contenu`)).json()) as {
      canEdit: boolean;
    };
    expect(contenu.canEdit).toBe(true);

    const shared = (await (await call(reader.cookie, '/partages')).json()) as {
      items: DocumentItem[];
    };
    expect(shared.items.map((i) => i.id)).toContain(id);

    const list = (await (
      await call(reader.cookie, `/${id}/collaborateurs`)
    ).json()) as CollaboratorList;
    expect(list.owner?.id).toBe(owner.id);
    expect(list.collaborators.map((c) => c.email)).toEqual(['lectrice@exemple.fr']);
    expect(list.canManage).toBe(false);
  });

  it('cherche les comptes à inviter, sans le créateur ni les déjà invités', async () => {
    const id = await newDocument();
    const dana = await createAccount(t, 'editeur', 'dana-recherche@exemple.fr');
    await createAccount(t, 'editeur', 'dora-recherche@exemple.fr');
    await invite(owner.cookie, id, dana);
    const response = await call(owner.cookie, `/${id}/invitables?q=recherche`);
    const { accounts } = (await response.json()) as { accounts: InvitableAccount[] };
    expect(accounts.map((a) => a.email)).toEqual(['dora-recherche@exemple.fr']);
    const mine = await call(owner.cookie, `/${id}/invitables?q=proprio`);
    expect(((await mine.json()) as { accounts: unknown[] }).accounts).toEqual([]);
    expect((await call(owner.cookie, `/${id}/invitables?q=a`)).status).toBe(400);
    const wildcard = await call(owner.cookie, `/${id}/invitables?q=%25%25`);
    expect(((await wildcard.json()) as { accounts: unknown[] }).accounts).toEqual([]);
  });

  it('réserve l’invitation au créateur et aux admins', async () => {
    const id = await newDocument();
    const fred = await createAccount(t, 'editeur', 'fred@exemple.fr');
    expect((await invite(other.cookie, id, fred)).status).toBe(403);
    expect((await call(other.cookie, `/${id}/invitables?q=fred`)).status).toBe(403);
    expect((await invite(admin.cookie, id, fred)).status).toBe(201);
  });

  it('refuse une invitation en double, au créateur, sur un dossier ou un compte inconnu', async () => {
    const id = await newDocument();
    const gus = await createAccount(t, 'editeur', 'gus@exemple.fr');
    expect((await invite(owner.cookie, id, gus)).status).toBe(201);
    expect((await invite(owner.cookie, id, gus)).status).toBe(409);
    expect((await invite(owner.cookie, id, owner.id)).status).toBe(409);
    expect((await invite(owner.cookie, id, 'inconnu')).status).toBe(404);
    expect((await invite(owner.cookie, await newDocument('folder'), gus)).status).toBe(400);
  });

  it('retire une invitation : la personne ne peut plus écrire', async () => {
    const id = await newDocument();
    await invite(owner.cookie, id, other.id);
    expect((await uninvite(owner.cookie, id, other.id)).status).toBe(204);
    expect((await write(other.cookie, id, ['non'])).status).toBe(403);
    expect((await uninvite(owner.cookie, id, other.id)).status).toBe(404);
  });

  it('laisse un invité se retirer lui-même, mais pas retirer les autres', async () => {
    const id = await newDocument();
    const jules = await createAccount(t, 'editeur', 'jules@exemple.fr');
    await invite(owner.cookie, id, other.id);
    await invite(owner.cookie, id, jules);
    expect((await uninvite(other.cookie, id, jules)).status).toBe(403);
    expect((await uninvite(other.cookie, id, other.id)).status).toBe(204);
  });
});
