import { ApiError } from '@/api';
import {
  imagesOf,
  pastedImages,
  uploadFailure,
  uploadFile,
  uploadProblem,
} from '@/documents/upload';

function fichier(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size) as BlobPart], name, { type });
}

describe('uploadProblem', () => {
  it('laisse passer un fichier ordinaire', () => {
    expect(uploadProblem(fichier('plan.pdf', 'application/pdf'))).toBeNull();
  });

  it('refuse un fichier vide', () => {
    expect(uploadProblem(fichier('rien.pdf', 'application/pdf', 0))).toMatch(/vide/);
  });

  it('refuse un fichier au-dessus de la limite, en nommant la limite', () => {
    expect(uploadProblem(fichier('gros.pdf', 'application/pdf', 25_000_001))).toBe(
      '« gros.pdf » dépasse 25 Mo.',
    );
  });
});

describe('imagesOf', () => {
  it('ne garde que les images des types acceptés', () => {
    const chosen = [
      fichier('a.png', 'image/png'),
      fichier('b.pdf', 'application/pdf'),
      fichier('c.svg', 'image/svg+xml'),
      fichier('d.webp', 'image/webp'),
    ];
    expect(imagesOf(chosen).map((f) => f.name)).toEqual(['a.png', 'd.webp']);
  });

  it('supporte l’absence de fichiers', () => {
    expect(imagesOf(null)).toEqual([]);
    expect(imagesOf(undefined)).toEqual([]);
  });
});

describe('pastedImages', () => {
  it('prend les fichiers du presse-papiers quand il y en a', () => {
    const image = fichier('collee.png', 'image/png');
    const data = { files: [image], items: [] } as unknown as DataTransfer;
    expect(pastedImages(data)).toEqual([image]);
  });

  it('retombe sur les éléments quand le presse-papiers n’expose pas de fichiers', () => {
    const image = fichier('collee.png', 'image/png');
    const data = {
      files: [],
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => image },
      ],
    } as unknown as DataTransfer;
    expect(pastedImages(data)).toEqual([image]);
  });

  it('ignore un collage sans image', () => {
    const data = {
      files: [],
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    } as unknown as DataTransfer;
    expect(pastedImages(data)).toEqual([]);
    expect(pastedImages(null)).toEqual([]);
  });
});

describe('uploadFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envoie le fichier et son usage, et rend le fichier créé', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ file: { id: 'f1', name: 'a.png' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = await uploadFile('d1', fichier('a.png', 'image/png'), 'inline');
    expect(file).toEqual({ id: 'f1', name: 'a.png' });

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/documents/fichiers/d1');
    const body = init.body as FormData;
    expect(body.get('usage')).toBe('inline');
    expect(body.get('fichier')).toBeInstanceOf(File);
  });

  it('refuse un fichier trop gros sans appeler l’API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      uploadFile('d1', fichier('gros.png', 'image/png', 25_000_001), 'inline'),
    ).rejects.toThrow(/dépasse/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('uploadFailure', () => {
  it('reprend le message de l’API', () => {
    expect(uploadFailure(new ApiError(415, 'Type refusé'))).toBe('Type refusé');
  });

  it('retombe sur un message lisible pour le reste', () => {
    expect(uploadFailure(new TypeError('réseau'))).toMatch(/réessayez/);
  });
});
