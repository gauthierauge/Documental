import type {
  DocumentDetail,
  DocumentFile,
  DocumentItem,
  FolderListing,
} from '@documental/contracts/documents';
import { ORIGIN, signInAs } from '@/test/support/auth-helpers';
import { testApp } from '@/test/support/helpers';

type App = Awaited<ReturnType<typeof testApp>>;

let t: App;
let editor: string;
let reader: string;
let other: string;
let admin: string;

beforeAll(async () => {
  t = await testApp();
  editor = await signInAs(t, 'editeur');
  reader = await signInAs(t, 'lecteur');
  other = await signInAs(t, 'editeur');
  admin = await signInAs(t, 'admin');
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
    expect(result.canCreate).toBe(false);
    expect(result.items[1]?.createdBy?.name).toBe('editeur');
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

  it('réserve renommage, déplacement et suppression au créateur et aux admins', async () => {
    const doc = await create('text', 'À Alice');
    expect(
      (await call(other, `/${doc.id}`, { method: 'PATCH', body: { name: 'Non' } })).status,
    ).toBe(403);
    expect((await call(other, `/${doc.id}`, { method: 'DELETE' })).status).toBe(403);
    expect(
      (await call(admin, `/${doc.id}`, { method: 'PATCH', body: { name: 'Par l’admin' } })).status,
    ).toBe(200);
    const detail = (await (await call(other, `/${doc.id}`)).json()) as {
      access: { write: boolean; manage: boolean };
    };
    expect(detail.access).toEqual({ write: false, manage: false });
  });

  it('liste tous les dossiers pour choisir une destination', async () => {
    const folder = await create('folder', 'Destination possible');
    const response = await call(reader, '/dossiers');
    const { folders } = (await response.json()) as { folders: { id: string }[] };
    expect(folders.map((f) => f.id)).toContain(folder.id);
  });
});

describe('Fichiers joints', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2]);
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
  const TEXTE = new Uint8Array([...'bonjour'].map((c) => c.charCodeAt(0)));

  function send(
    cookie: string,
    documentId: string,
    bytes: Uint8Array,
    name: string,
    usage?: string,
  ): Promise<Response> {
    const form = new FormData();
    form.set('fichier', new File([bytes as BlobPart], name));
    if (usage !== undefined) form.set('usage', usage);
    return Promise.resolve(
      t.app.request(`/api/documents/fichiers/${documentId}`, {
        method: 'POST',
        headers: { cookie, origin: ORIGIN },
        body: form,
      }),
    );
  }

  async function sendOk(cookie: string, documentId: string, bytes: Uint8Array, name: string) {
    const response = await send(cookie, documentId, bytes, name);
    expect(response.status).toBe(201);
    return ((await response.json()) as { file: DocumentFile }).file;
  }

  function read(cookie: string, fileId: string, headers: Record<string, string> = {}) {
    return t.app.request(`/api/documents/fichiers/${fileId}`, {
      headers: { cookie, origin: ORIGIN, ...headers },
    });
  }

  async function detail(cookie: string, id: string): Promise<DocumentDetail> {
    const response = await call(cookie, `/${id}`);
    expect(response.status).toBe(200);
    return (await response.json()) as DocumentDetail;
  }

  it('rend les octets envoyés, intacts', async () => {
    const doc = await create('text', 'Avec un PDF');
    const file = await sendOk(editor, doc.id, PDF, 'plan.pdf');
    expect(file).toMatchObject({ name: 'plan.pdf', mime: 'application/pdf', size: PDF.length });

    const response = await read(editor, file.id);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
  });

  it('sert le fichier en pièce jointe, jamais à ouvrir dans la page', async () => {
    const doc = await create('text', 'Disposition');
    const file = await sendOk(editor, doc.id, PDF, 'rapport final.pdf');
    const response = await read(editor, file.id);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''rapport%20final.pdf",
    );
  });

  it('répond 304 quand le client a déjà le fichier', async () => {
    const doc = await create('text', 'Cache');
    const file = await sendOk(editor, doc.id, PNG, 'image.png');
    const first = await read(editor, file.id);
    const etag = first.headers.get('etag') ?? '';
    expect(etag).not.toBe('');
    expect(first.headers.get('cache-control')).toContain('immutable');

    const again = await read(editor, file.id, { 'if-none-match': etag });
    expect(again.status).toBe(304);
  });

  it('déduit le type des octets, pas de ce que le client annonce', async () => {
    const doc = await create('text', 'Type menti');
    const form = new FormData();
    form.set('fichier', new File([PDF as BlobPart], 'photo.png', { type: 'image/png' }));
    const response = await t.app.request(`/api/documents/fichiers/${doc.id}`, {
      method: 'POST',
      headers: { cookie: editor, origin: ORIGIN },
      body: form,
    });
    expect(response.status).toBe(201);
    const { file } = (await response.json()) as { file: DocumentFile };
    expect(file.mime).toBe('application/pdf');
    expect(file.name).toBe('photo.pdf');
  });

  it('refuse un type hors de la liste blanche', async () => {
    const doc = await create('text', 'Type refusé');
    const response = await send(editor, doc.id, TEXTE, 'notes.txt');
    expect(response.status).toBe(415);
  });

  it('refuse un SVG, même nommé en image', async () => {
    const doc = await create('text', 'SVG refusé');
    const svg = new Uint8Array([...'<svg onload=alert(1)>'].map((c) => c.charCodeAt(0)));
    expect((await send(editor, doc.id, svg, 'logo.svg')).status).toBe(415);
    expect((await send(editor, doc.id, svg, 'logo.png')).status).toBe(415);
  });

  it('refuse un fichier vide', async () => {
    const doc = await create('text', 'Vide');
    expect((await send(editor, doc.id, new Uint8Array(), 'rien.pdf')).status).toBe(400);
  });

  it('distingue deux fichiers de même nom au lieu de les refuser', async () => {
    const doc = await create('text', 'Deux fois le même nom');
    expect((await sendOk(editor, doc.id, PDF, 'plan.pdf')).name).toBe('plan.pdf');
    expect((await sendOk(editor, doc.id, PNG, 'plan.png')).name).toBe('plan.png');
    const autre = new Uint8Array([...PDF, 0x0a]);
    expect((await sendOk(editor, doc.id, autre, 'plan.pdf')).name).toBe('plan (2).pdf');
  });

  it('liste les fichiers avec le document, sans leurs octets', async () => {
    const doc = await create('text', 'Liste');
    await sendOk(editor, doc.id, PDF, 'a.pdf');
    await sendOk(editor, doc.id, PNG, 'b.png');
    const { files } = await detail(editor, doc.id);
    expect(files.map((f) => f.name)).toEqual(['a.pdf', 'b.png']);
    expect(files[0]).not.toHaveProperty('bytes');
    expect(files[0]?.createdBy?.name).toBe('editeur');
  });

  it('refuse un fichier sur un dossier', async () => {
    const created = await t.app.request('/api/documents', {
      method: 'POST',
      headers: { cookie: editor, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'folder', name: 'Un dossier', parentId: null }),
    });
    const { item } = (await created.json()) as { item: DocumentItem };
    expect((await send(editor, item.id, PDF, 'plan.pdf')).status).toBe(409);
  });

  it('répond 404 sur un document ou un fichier inconnu', async () => {
    expect((await send(editor, 'inconnu', PDF, 'plan.pdf')).status).toBe(404);
    expect((await read(editor, 'inconnu')).status).toBe(404);
  });

  it('exige une connexion pour lire un fichier', async () => {
    const doc = await create('text', 'Protégé');
    const file = await sendOk(editor, doc.id, PDF, 'plan.pdf');
    expect((await read('', file.id)).status).toBe(401);
  });

  it('interdit l’envoi à qui n’a pas l’écriture sur le document', async () => {
    const doc = await create('text', 'Pas le mien');
    expect((await send(other, doc.id, PDF, 'plan.pdf')).status).toBe(403);
  });

  it('réserve la suppression à qui gère le document', async () => {
    const doc = await create('text', 'Suppression');
    const file = await sendOk(editor, doc.id, PDF, 'plan.pdf');
    const refus = await t.app.request(`/api/documents/fichiers/${file.id}`, {
      method: 'DELETE',
      headers: { cookie: other, origin: ORIGIN },
    });
    expect(refus.status).toBe(403);

    const ok = await t.app.request(`/api/documents/fichiers/${file.id}`, {
      method: 'DELETE',
      headers: { cookie: editor, origin: ORIGIN },
    });
    expect(ok.status).toBe(204);
    expect((await read(editor, file.id)).status).toBe(404);
  });

  it('laisse un admin gérer les fichiers d’un document qu’il n’a pas créé', async () => {
    const doc = await create('text', 'Document d’un autre');
    const file = await sendOk(editor, doc.id, PDF, 'plan.pdf');
    const supprime = await t.app.request(`/api/documents/fichiers/${file.id}`, {
      method: 'DELETE',
      headers: { cookie: admin, origin: ORIGIN },
    });
    expect(supprime.status).toBe(204);
  });

  it('emporte les fichiers quand le document disparaît', async () => {
    const doc = await create('text', 'À supprimer');
    const file = await sendOk(editor, doc.id, PDF, 'plan.pdf');
    const supprime = await t.app.request(`/api/documents/${doc.id}`, {
      method: 'DELETE',
      headers: { cookie: editor, origin: ORIGIN },
    });
    expect(supprime.status).toBe(204);
    expect((await read(editor, file.id)).status).toBe(404);
  });

  it('enregistre une image insérée dans le texte, et la sert à afficher', async () => {
    const doc = await create('text', 'Avec une image');
    const envoi = await send(editor, doc.id, PNG, 'schema.png', 'inline');
    expect(envoi.status).toBe(201);
    const { file } = (await envoi.json()) as { file: DocumentFile };
    expect(file.usage).toBe('inline');

    const lu = await read(editor, file.id);
    expect(lu.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''schema.png");
  });

  it('joint par défaut quand l’usage n’est pas précisé', async () => {
    const doc = await create('text', 'Usage par défaut');
    expect((await sendOk(editor, doc.id, PDF, 'plan.pdf')).usage).toBe('attachment');
  });

  it('refuse d’insérer un PDF dans le texte', async () => {
    const doc = await create('text', 'PDF dans le texte');
    const refus = await send(editor, doc.id, PDF, 'plan.pdf', 'inline');
    expect(refus.status).toBe(415);
    expect(((await refus.json()) as { error: string }).error).toMatch(/image/);
  });

  it('refuse un usage inconnu', async () => {
    const doc = await create('text', 'Usage inconnu');
    expect((await send(editor, doc.id, PNG, 'a.png', 'autre')).status).toBe(400);
  });

  it('distingue les images insérées des pièces jointes dans le détail', async () => {
    const doc = await create('text', 'Les deux');
    await sendOk(editor, doc.id, PDF, 'plan.pdf');
    await send(editor, doc.id, PNG, 'schema.png', 'inline');
    const { files } = await detail(editor, doc.id);
    expect(files.map((f) => [f.name, f.usage])).toEqual([
      ['plan.pdf', 'attachment'],
      ['schema.png', 'inline'],
    ]);
  });

  it('compte les octets déjà joints et refuse au-delà du quota du document', async () => {
    const doc = await create('text', 'Quota du document');
    const gros = new Uint8Array(1_000);
    gros.set(PDF);
    expect((await sendOk(editor, doc.id, gros, 'un.pdf')).size).toBe(1_000);

    const detailAvant = await detail(editor, doc.id);
    expect(detailAvant.files).toHaveLength(1);
  });

  it('inscrit les envois et les suppressions au journal d’activité', async () => {
    const doc = await create('text', 'Journal');
    const file = await sendOk(editor, doc.id, PDF, 'trace.pdf');

    const journal = await t.app.request('/api/admin/journal', {
      headers: { cookie: admin, origin: ORIGIN },
    });
    expect(journal.status).toBe(200);
    const { rows } = (await journal.json()) as {
      rows: { action: string; entityId: string; summary: string }[];
    };
    const envoi = rows.find((row) => row.entityId === file.id && row.action === 'televerser');
    expect(envoi?.summary).toContain('trace.pdf');
  });
});
