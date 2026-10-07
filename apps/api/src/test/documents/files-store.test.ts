import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { DocumentFileStore, freeName } from '@/documents/files-store';
import { testApp } from '@/test/support/helpers';

describe('freeName', () => {
  it('garde le nom quand il est libre', () => {
    expect(freeName(new Set(), 'plan.pdf')).toBe('plan.pdf');
  });

  it('numérote à partir de deux, en gardant l’extension', () => {
    expect(freeName(new Set(['plan.pdf']), 'plan.pdf')).toBe('plan (2).pdf');
    expect(freeName(new Set(['plan.pdf', 'plan (2).pdf']), 'plan.pdf')).toBe('plan (3).pdf');
  });

  it('numérote aussi un nom sans extension', () => {
    expect(freeName(new Set(['notes']), 'notes')).toBe('notes (2)');
  });

  it('ne coupe pas un nom qui commence par un point', () => {
    expect(freeName(new Set(['.gitignore']), '.gitignore')).toBe('.gitignore (2)');
  });
});

describe('Ramassage des images orphelines', () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  let store: DocumentFileStore;
  let auteur: string;

  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const VIEUX = new Date('2026-01-01T00:00:00.000Z');
  const MAINTENANT = new Date('2026-10-05T00:00:00.000Z');

  beforeAll(async () => {
    t = await testApp();
    store = new DocumentFileStore(t.deps.db);
    const [compte] = await t.deps.db
      .insert(schema.user)
      .values({ name: 'Rédactrice', email: `r-${crypto.randomUUID()}@exemple.fr` })
      .returning({ id: schema.user.id });
    auteur = compte?.id ?? '';
  });

  async function document(content: string): Promise<string> {
    const [row] = await t.deps.db
      .insert(schema.document)
      .values({ kind: 'text', name: `Doc ${crypto.randomUUID()}`, content })
      .returning({ id: schema.document.id });
    return row?.id ?? '';
  }

  async function joindre(documentId: string, usage: 'inline' | 'attachment', createdAt: Date) {
    const file = await store.add({
      documentId,
      name: `${crypto.randomUUID()}.png`,
      mime: 'image/png',
      usage,
      bytes: PNG,
      userId: auteur,
    });
    await t.deps.db
      .update(schema.documentFile)
      .set({ createdAt })
      .where(eq(schema.documentFile.id, file.id));
    return file;
  }

  it('retire une image que le texte ne cite plus', async () => {
    const doc = await document('Le texte a changé.');
    const orpheline = await joindre(doc, 'inline', VIEUX);

    expect(await store.collectOrphans(MAINTENANT)).toBeGreaterThanOrEqual(1);
    expect(await store.get(orpheline.id)).toBeNull();
  });

  it('garde une image que le texte cite encore', async () => {
    const doc = await document('placeholder');
    const citee = await joindre(doc, 'inline', VIEUX);
    await t.deps.db
      .update(schema.document)
      .set({ content: `Voir ![plan](/api/documents/fichiers/${citee.id}) ci-dessus.` })
      .where(eq(schema.document.id, doc));

    await store.collectOrphans(MAINTENANT);
    expect(await store.get(citee.id)).not.toBeNull();
  });

  it('laisse le délai de grâce à une image tout juste envoyée', async () => {
    const doc = await document('Pas encore insérée.');
    const recente = await joindre(doc, 'inline', new Date('2026-10-04T23:00:00.000Z'));

    await store.collectOrphans(new Date('2026-10-04T00:00:00.000Z'));
    expect(await store.get(recente.id)).not.toBeNull();
  });

  it('ne touche jamais aux pièces jointes : elles ne sont citées nulle part', async () => {
    const doc = await document('Un texte sans image.');
    const jointe = await joindre(doc, 'attachment', VIEUX);

    await store.collectOrphans(MAINTENANT);
    expect(await store.get(jointe.id)).not.toBeNull();
  });

  it('compte les octets d’un document', async () => {
    const doc = await document('Octets');
    await joindre(doc, 'attachment', VIEUX);
    await joindre(doc, 'attachment', VIEUX);
    expect(await store.bytesFor(doc)).toBe(PNG.length * 2);
  });
});
