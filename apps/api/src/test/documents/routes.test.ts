import type { DocumentItem, FolderListing } from '@documental/contracts/documents';
import { ORIGIN, signInAs } from '@/test/support/auth-helpers';
import { testApp } from '@/test/support/helpers';

type App = Awaited<ReturnType<typeof testApp>>;

let t: App;
let editor: string;
let reader: string;

beforeAll(async () => {
  t = await testApp();
  editor = await signInAs(t, 'editeur');
  reader = await signInAs(t, 'lecteur');
});

function call(cookie: string, path: string, init: { method?: string; body?: unknown } = {}) {
  return t.app.request(`/api/documents${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function create(
  kind: 'folder' | 'text',
  name: string,
  parentId: string | null = null,
): Promise<DocumentItem> {
  const response = await call(editor, '', { method: 'POST', body: { kind, name, parentId } });
  expect(response.status).toBe(201);
  return ((await response.json()) as { item: DocumentItem }).item;
}

async function listing(cookie: string, folderId?: string): Promise<FolderListing> {
  const response = await call(cookie, folderId ? `?dossier=${folderId}` : '');
  expect(response.status).toBe(200);
  return (await response.json()) as FolderListing;
}

describe('Espace documentaire', () => {
  it('exige une connexion', async () => {
    expect((await call('', '')).status).toBe(401);
  });

  it('liste un dossier avec la date et l’auteur de la dernière modification', async () => {
    const folder = await create('folder', 'Projets');
    await create('text', 'Cahier des charges', folder.id);
    await create('folder', 'Archives', folder.id);

    const result = await listing(reader, folder.id);
    expect(result.folder?.name).toBe('Projets');
    expect(result.path).toEqual([{ id: folder.id, name: 'Projets' }]);
    expect(result.items.map((i) => [i.kind, i.name])).toEqual([
      ['folder', 'Archives'],
      ['text', 'Cahier des charges'],
    ]);
    expect(result.items[1]?.updatedBy?.name).toBe('editeur');
    expect(Date.parse(result.items[1]?.updatedAt ?? '')).not.toBeNaN();
    expect(result.canEdit).toBe(false);
  });

  it('donne le chemin d’un document', async () => {
    const parent = await create('folder', 'Équipe');
    const child = await create('folder', 'Comptes rendus', parent.id);
    const doc = await create('text', 'Réunion', child.id);
    const response = await call(reader, `/${doc.id}`);
    const detail = (await response.json()) as { path: { name: string }[] };
    expect(detail.path.map((p) => p.name)).toEqual(['Équipe', 'Comptes rendus', 'Réunion']);
  });

  it('refuse un nom invalide ou déjà pris dans le même dossier', async () => {
    await create('text', 'Unique');
    const taken = await call(editor, '', {
      method: 'POST',
      body: { kind: 'text', name: '  Unique ', parentId: null },
    });
    expect(taken.status).toBe(409);
    const invalid = await call(editor, '', {
      method: 'POST',
      body: { kind: 'text', name: 'a/b', parentId: null },
    });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: string }).error).toMatch(/\//);
  });

  it('refuse un dossier parent inconnu ou qui n’est pas un dossier', async () => {
    const doc = await create('text', 'Pas un dossier');
    for (const parentId of ['inconnu', doc.id]) {
      const response = await call(editor, '', {
        method: 'POST',
        body: { kind: 'text', name: 'Enfant', parentId },
      });
      expect(response.status).toBe(404);
    }
  });

  it('renomme et déplace, en notant qui a modifié', async () => {
    const from = await create('folder', 'Source');
    const to = await create('folder', 'Destination');
    const doc = await create('text', 'Brouillon', from.id);
    const response = await call(editor, `/${doc.id}`, {
      method: 'PATCH',
      body: { name: 'Version finale', parentId: to.id },
    });
    expect(response.status).toBe(200);
    const { item } = (await response.json()) as { item: DocumentItem };
    expect(item.name).toBe('Version finale');
    expect(item.parentId).toBe(to.id);
    expect((await listing(editor, from.id)).items).toEqual([]);
  });

  it('empêche de déplacer un dossier dans lui-même ou dans un sous-dossier', async () => {
    const parent = await create('folder', 'Parent');
    const child = await create('folder', 'Enfant', parent.id);
    for (const parentId of [parent.id, child.id]) {
      const response = await call(editor, `/${parent.id}`, {
        method: 'PATCH',
        body: { parentId },
      });
      expect(response.status).toBe(409);
    }
  });

  it('supprime un dossier avec son contenu', async () => {
    const folder = await create('folder', 'À supprimer');
    const doc = await create('text', 'Dedans', folder.id);
    expect((await call(editor, `/${folder.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(editor, `/${doc.id}`)).status).toBe(404);
    expect((await call(editor, `/${folder.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('laisse un lecteur consulter sans modifier', async () => {
    const doc = await create('text', 'Lecture seule');
    expect(
      (await call(reader, '', { method: 'POST', body: { kind: 'folder', name: 'Non' } })).status,
    ).toBe(403);
    expect(
      (await call(reader, `/${doc.id}`, { method: 'PATCH', body: { name: 'Non' } })).status,
    ).toBe(403);
    expect((await call(reader, `/${doc.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('liste tous les dossiers pour choisir une destination', async () => {
    const folder = await create('folder', 'Destination possible');
    const response = await call(reader, '/dossiers');
    const { folders } = (await response.json()) as { folders: { id: string }[] };
    expect(folders.map((f) => f.id)).toContain(folder.id);
  });
});
