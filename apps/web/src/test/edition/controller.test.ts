import type { OperationSubmission } from '@documental/contracts/edition';
import {
  EditionController,
  type EditionEvents,
  type EditionStatus,
  type EditionStorage,
} from '@/edition/controller';

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function memoryStorage(): EditionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function recorder() {
  const statuses: EditionStatus[] = [];
  const remote: string[] = [];
  const events: EditionEvents = {
    status: (status) => statuses.push(status),
    remote: (text) => remote.push(text),
  };
  return { events, statuses, remote };
}

type Handler = (url: string, body: OperationSubmission | null) => Response | Promise<Response>;

function server(handler: Handler) {
  const submissions: OperationSubmission[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as OperationSubmission) : null;
    if (body) submissions.push(body);
    return handler(String(input), body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return submissions;
}

const options = { delayMs: 0, retryMs: [0] };

describe('Enregistrement d’un document', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('charge le texte puis enregistre une frappe', async () => {
    const submissions = server((url, body) =>
      body
        ? respond({ revision: 3, missed: [] })
        : respond({ content: 'Bonjour', revision: 2, canEdit: true }),
    );
    const { events, statuses } = recorder();
    const storage = memoryStorage();
    const controller = new EditionController('d1', 'cle', events, { ...options, storage });
    expect(await controller.start()).toEqual({ text: 'Bonjour', canEdit: true });
    controller.change('Bonjour !', 9);
    expect(storage.data.has('cle')).toBe(true);
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('enregistre'));
    expect(submissions).toEqual([{ id: expect.any(String), base: 2, operation: [7, ' !'] }]);
    expect(storage.data.has('cle')).toBe(false);
    controller.stop();
  });

  it('garde la modification pendant une coupure et la renvoie à l’identique', async () => {
    let online = false;
    const submissions = server((_url, body) => {
      if (!body) return respond({ content: '', revision: 0, canEdit: true });
      if (!online) {
        online = true;
        throw new TypeError('Failed to fetch');
      }
      return respond({ revision: 1, missed: [] });
    });
    const { events, statuses } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      ...options,
      storage: memoryStorage(),
    });
    await controller.start();
    controller.change('a', 1);
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('enregistre'));
    expect(statuses).toContain('hors-ligne');
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toEqual(submissions[0]);
    controller.stop();
  });

  it('reprend après un rechargement les modifications jamais envoyées', async () => {
    const storage = memoryStorage();
    storage.setItem(
      'cle',
      JSON.stringify({
        text: 'abX',
        revision: 1,
        outstanding: null,
        buffer: [2, 'X'],
      }),
    );
    const submissions = server((url, body) => {
      if (body) return respond({ revision: 3, missed: [] });
      if (url.includes('/operations?depuis=1')) {
        return respond({
          operations: [{ id: 'autre', revision: 2, operation: ['>', 2], author: null }],
        });
      }
      return respond({ content: '>ab', revision: 2, canEdit: true });
    });
    const { events, statuses } = recorder();
    const controller = new EditionController('d1', 'cle', events, { ...options, storage });
    expect((await controller.start()).text).toBe('>abX');
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('enregistre'));
    expect(submissions[0]).toMatchObject({ base: 2, operation: [3, 'X'] });
    controller.stop();
  });

  it('affiche les modifications des autres reçues avec la confirmation', async () => {
    server((_url, body) =>
      body
        ? respond({
            revision: 3,
            missed: [{ id: 'autre', revision: 2, operation: ['Hé ', 2], author: null }],
          })
        : respond({ content: 'ok', revision: 1, canEdit: true }),
    );
    const { events, remote } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      ...options,
      storage: memoryStorage(),
    });
    await controller.start();
    controller.change('ok!', 3);
    await vi.waitFor(() => expect(remote).toEqual(['Hé ok!']));
    controller.stop();
  });

  it('s’arrête sur un refus du serveur', async () => {
    server((_url, body) =>
      body
        ? respond({ error: 'Action non permise' }, 403)
        : respond({ content: '', revision: 0, canEdit: true }),
    );
    const { events, statuses } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      ...options,
      storage: memoryStorage(),
    });
    await controller.start();
    controller.change('x', 1);
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('erreur'));
  });
});
