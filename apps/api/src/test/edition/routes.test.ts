import type { DocumentItem } from '@documental/contracts/documents';
import type {
  DocumentContent,
  OperationsSince,
  SubmissionResult,
} from '@documental/contracts/edition';
import { apply, diff, type TextOperation, transform } from '@documental/contracts/text-operation';
import { ORIGIN, signInAs } from '@/test/support/auth-helpers';
import { testApp } from '@/test/support/helpers';

type App = Awaited<ReturnType<typeof testApp>>;

let t: App;
let alice: string;
let bob: string;
let reader: string;
let counter = 0;

beforeAll(async () => {
  t = await testApp();
  alice = await signInAs(t, 'editeur', { email: 'alice@exemple.fr' });
  bob = await signInAs(t, 'admin', { email: 'bob@exemple.fr' });
  reader = await signInAs(t, 'lecteur');
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
  const response = await call(alice, '', {
    method: 'POST',
    body: { kind, name: `Document ${counter}`, parentId: null },
  });
  return ((await response.json()) as { item: DocumentItem }).item.id;
}

async function content(cookie: string, id: string): Promise<DocumentContent> {
  const response = await call(cookie, `/${id}/contenu`);
  expect(response.status).toBe(200);
  return (await response.json()) as DocumentContent;
}

function submit(cookie: string, id: string, base: number, operation: TextOperation, opId?: string) {
  counter += 1;
  return call(cookie, `/${id}/operations`, {
    method: 'POST',
    body: { id: opId ?? `operation-${counter}`, base, operation },
  });
}

describe('Écriture dans un document', () => {
  it('part d’un document vide, puis enregistre chaque modification', async () => {
    const id = await newDocument();
    expect(await content(alice, id)).toEqual({ content: '', revision: 0, canEdit: true });

    const first = await submit(alice, id, 0, ['Bonjour']);
    expect(first.status).toBe(200);
    expect(((await first.json()) as SubmissionResult).revision).toBe(1);
    await submit(alice, id, 1, [7, ' à tous']);

    expect(await content(alice, id)).toMatchObject({ content: 'Bonjour à tous', revision: 2 });
  });

  it('note la dernière modification dans la liste des documents', async () => {
    const id = await newDocument();
    await submit(bob, id, 0, ['Écrit par Bob']);
    const response = await call(alice, `/${id}`);
    const { item } = (await response.json()) as { item: DocumentItem };
    expect(item.updatedBy?.name).toBe('admin');
  });

  it('fusionne deux modifications faites en même temps sur la même version', async () => {
    const id = await newDocument();
    await submit(alice, id, 0, ['Réunion lundi']);
    const text = 'Réunion lundi';
    const fromAlice = diff(text, 'Réunion lundi matin');
    const fromBob = diff(text, 'Grande Réunion lundi');

    const bobResult = (await (await submit(bob, id, 1, fromBob)).json()) as SubmissionResult;
    expect(bobResult).toEqual({ revision: 2, missed: [] });

    const aliceResponse = await submit(alice, id, 1, fromAlice);
    const aliceResult = (await aliceResponse.json()) as SubmissionResult;
    expect(aliceResult.revision).toBe(3);
    expect(aliceResult.missed.map((m) => m.operation)).toEqual([fromBob]);
    expect(aliceResult.missed[0]?.author?.name).toBe('admin');

    const onAliceScreen = apply(
      apply(text, fromAlice),
      transform(aliceResult.missed[0]?.operation ?? [], fromAlice)[0],
    );
    const saved = await content(alice, id);
    expect(saved.content).toBe('Grande Réunion lundi matin');
    expect(onAliceScreen).toBe(saved.content);
  });

  it('n’applique pas deux fois une modification renvoyée après une coupure', async () => {
    const id = await newDocument();
    await submit(alice, id, 0, ['abc']);
    const first = await submit(alice, id, 1, [3, 'd'], 'meme-operation');
    const again = await submit(alice, id, 1, [3, 'd'], 'meme-operation');
    expect(((await again.json()) as SubmissionResult).revision).toBe(
      ((await first.json()) as SubmissionResult).revision,
    );
    expect((await content(alice, id)).content).toBe('abcd');
  });

  it('donne les modifications depuis une version', async () => {
    const id = await newDocument();
    await submit(alice, id, 0, ['un']);
    await submit(bob, id, 1, [2, ' deux']);
    const response = await call(reader, `/${id}/operations?depuis=1`);
    const { operations } = (await response.json()) as OperationsSince;
    expect(operations.map((o) => [o.revision, o.operation])).toEqual([[2, [2, ' deux']]]);
  });

  it('refuse une modification incohérente, invalide ou trop grande', async () => {
    const id = await newDocument();
    await submit(alice, id, 0, ['abc']);
    expect((await submit(alice, id, 1, [10, 'x'])).status).toBe(409);
    expect((await submit(alice, id, 5, [3, 'x'])).status).toBe(409);
    expect((await submit(alice, id, 1, [3, 0 as unknown as string])).status).toBe(400);
    expect((await submit(alice, id, 1, [3, '\uD83D'])).status).toBe(400);
    expect((await submit(alice, id, 1, [3, 'x'.repeat(500_000)])).status).toBe(413);
    expect((await content(alice, id)).content).toBe('abc');
  });

  it('laisse un lecteur lire sans écrire', async () => {
    const id = await newDocument();
    expect((await content(reader, id)).canEdit).toBe(false);
    expect((await submit(reader, id, 0, ['non'])).status).toBe(403);
  });

  it('ne traite pas un dossier ou un document inconnu comme un texte', async () => {
    const folder = await newDocument('folder');
    expect((await call(alice, `/${folder}/contenu`)).status).toBe(404);
    expect((await submit(alice, folder, 0, ['x'])).status).toBe(404);
    expect((await call(alice, '/inconnu/operations?depuis=0')).status).toBe(404);
  });

  it('vérifie l’origine, la version et le document avant d’ouvrir le direct', async () => {
    const id = await newDocument();
    await submit(alice, id, 0, ['abc']);
    const direct = (path: string, origin = ORIGIN) =>
      t.app.request(`/api/documents${path}`, { headers: { cookie: alice, origin } });
    expect((await direct(`/${id}/direct?depuis=1`, 'https://pirate.exemple')).status).toBe(403);
    expect((await direct(`/${id}/direct?depuis=5`)).status).toBe(409);
    expect((await direct('/inconnu/direct?depuis=0')).status).toBe(404);
    expect((await direct(`/${id}/direct`)).status).toBe(400);
    expect((await direct(`/${id}/direct?depuis=1`)).status).toBe(426);
  });

  it('exige une connexion', async () => {
    const id = await newDocument();
    expect((await call('', `/${id}/contenu`)).status).toBe(401);
  });
});
