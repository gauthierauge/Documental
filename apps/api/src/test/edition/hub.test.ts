import type { ServerMessage } from '@documental/contracts/edition';
import type { SessionUser } from '@/auth/middleware';
import type { Database } from '@/db/client';
import * as schema from '@/db/schema';
import { type Connection, EditionHub } from '@/edition/hub';
import { EditionStore } from '@/edition/store';
import { testDatabase } from '@/test/support/database';

let database: Database;
let store: EditionStore;
let editor: SessionUser;
let reader: SessionUser;
let counter = 0;

async function newUser(role: 'editeur' | 'lecteur'): Promise<SessionUser> {
  counter += 1;
  const email = `${role}-hub-${counter}@exemple.fr`;
  const [row] = await database.db
    .insert(schema.user)
    .values({ email, name: `${role} ${counter}`, role })
    .returning({ id: schema.user.id });
  return { id: row?.id ?? '', email, name: `${role} ${counter}`, role };
}

async function newDocument(): Promise<string> {
  counter += 1;
  const [row] = await database.db
    .insert(schema.document)
    .values({ kind: 'text', name: `Hub ${counter}` })
    .returning({ id: schema.document.id });
  return row?.id ?? '';
}

function connection(user: SessionUser) {
  const messages: ServerMessage[] = [];
  const closed: { code: number; reason: string }[] = [];
  const conn: Connection = {
    user,
    send: (message) => messages.push(message),
    close: (code, reason) => closed.push({ code, reason }),
  };
  return { conn, messages, closed };
}

function modification(id: string, base: number, operation: (number | string)[]): string {
  return JSON.stringify({ type: 'modification', id, base, operation });
}

beforeAll(async () => {
  database = await testDatabase();
  store = new EditionStore(database.db);
  editor = await newUser('editeur');
  reader = await newUser('lecteur');
});

describe('Diffusion des modifications', () => {
  it('rattrape les modifications manquées puis annonce que la connexion est prête', async () => {
    const id = await newDocument();
    await store.submit(id, { id: 'avant-1', base: 0, operation: ['ab'] }, editor.id);
    await store.submit(id, { id: 'avant-2', base: 1, operation: [2, 'c'] }, editor.id);
    const hub = new EditionHub(store, database.listen);
    const alice = connection(editor);
    await hub.join(id, alice.conn, 1);
    expect(alice.messages).toEqual([
      expect.objectContaining({ type: 'operation', revision: 2, id: 'avant-2' }),
      { type: 'pret', revision: 2 },
    ]);
  });

  it('envoie chaque modification à tous, l’auteur compris, sur les deux serveurs', async () => {
    const id = await newDocument();
    const serverA = new EditionHub(store, database.listen);
    const serverB = new EditionHub(store, database.listen);
    const alice = connection(editor);
    const bob = connection(editor);
    await serverA.join(id, alice.conn, 0);
    await serverB.join(id, bob.conn, 0);

    await serverA.receive(id, alice.conn, modification('alice-0001', 0, ['Bonjour']));

    const expected = expect.objectContaining({
      type: 'operation',
      id: 'alice-0001',
      revision: 1,
      operation: ['Bonjour'],
      author: { id: editor.id, name: editor.name },
    });
    await vi.waitFor(() => expect(bob.messages).toContainEqual(expected));
    await vi.waitFor(() => expect(alice.messages).toContainEqual(expected));
    expect(alice.messages.filter((m) => m.type === 'operation')).toHaveLength(1);
  });

  it('transforme deux modifications simultanées et les diffuse dans le même ordre', async () => {
    const id = await newDocument();
    await store.submit(id, { id: 'base', base: 0, operation: ['lundi'] }, editor.id);
    const hub = new EditionHub(store, database.listen);
    const alice = connection(editor);
    const bob = connection(editor);
    await hub.join(id, alice.conn, 1);
    await hub.join(id, bob.conn, 1);

    await Promise.all([
      hub.receive(id, alice.conn, modification('alice-0002', 1, [5, ' matin'])),
      hub.receive(id, bob.conn, modification('bob-00002', 1, ['Réunion ', 5])),
    ]);

    await vi.waitFor(async () =>
      expect((await store.content(id))?.content).toBe('Réunion lundi matin'),
    );
    await vi.waitFor(() =>
      expect(bob.messages.filter((m) => m.type === 'operation').map((m) => m.revision)).toEqual([
        2, 3,
      ]),
    );
    expect(alice.messages.filter((m) => m.type === 'operation')).toEqual(
      bob.messages.filter((m) => m.type === 'operation'),
    );
  });

  it('refuse l’écriture à un lecteur et un message invalide', async () => {
    const id = await newDocument();
    const hub = new EditionHub(store, database.listen);
    const lecteur = connection(reader);
    await hub.join(id, lecteur.conn, 0);
    await hub.receive(id, lecteur.conn, modification('lecteur-1', 0, ['non']));
    await hub.receive(id, lecteur.conn, '{pas du json');
    expect(lecteur.messages.slice(1)).toEqual([
      expect.objectContaining({ type: 'erreur', status: 403, id: 'lecteur-1' }),
      expect.objectContaining({ type: 'erreur', status: 400 }),
    ]);
    expect((await store.content(id))?.content).toBe('');
  });

  it('renvoie l’erreur d’une modification incohérente à son auteur', async () => {
    const id = await newDocument();
    const hub = new EditionHub(store, database.listen);
    const alice = connection(editor);
    await hub.join(id, alice.conn, 0);
    await hub.receive(id, alice.conn, modification('incoherente', 0, [4, 'x']));
    expect(alice.messages.at(-1)).toMatchObject({ type: 'erreur', status: 409, id: 'incoherente' });
  });

  it('ferme une connexion qui envoie trop de messages', async () => {
    const id = await newDocument();
    const hub = new EditionHub(store, database.listen, { messagesPerSecond: 2, now: () => 0 });
    const alice = connection(editor);
    await hub.join(id, alice.conn, 0);
    for (let i = 0; i < 3; i++) await hub.receive(id, alice.conn, '{}');
    expect(alice.closed).toEqual([{ code: 1008, reason: 'Trop de messages' }]);
  });

  it('oublie une connexion fermée', async () => {
    const id = await newDocument();
    const hub = new EditionHub(store, database.listen);
    const alice = connection(editor);
    await hub.join(id, alice.conn, 0);
    expect(hub.size(id)).toBe(1);
    hub.leave(id, alice.conn);
    expect(hub.size(id)).toBe(0);
  });
});
