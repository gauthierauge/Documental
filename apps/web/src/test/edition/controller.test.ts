import type { OperationSubmission, ServerMessage } from '@documental/contracts/edition';
import {
  EditionController,
  type EditionEvents,
  type EditionStatus,
  type EditionStorage,
  type SocketLike,
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

const options = { delayMs: 0, retryMs: [0], connect: null };

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

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: Record<string, unknown>[] = [];
  closed = false;

  constructor(readonly path: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  receive(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function sockets() {
  const opened: FakeSocket[] = [];
  const connect = (path: string) => {
    const socket = new FakeSocket(path);
    opened.push(socket);
    return socket;
  };
  return { opened, connect };
}

function contentOnly(content: string, revision: number) {
  server(() => respond({ content, revision, canEdit: true }));
}

describe('Édition en direct', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ouvre le direct à la version chargée et envoie les frappes une fois prêt', async () => {
    contentOnly('Bonjour', 4);
    const { opened, connect } = sockets();
    const { events, statuses } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      delayMs: 0,
      connect,
      storage: memoryStorage(),
    });
    await controller.start();
    expect(opened[0]?.path).toBe('/api/documents/d1/direct?depuis=4');
    controller.change('Bonjour !', 9);
    expect(opened[0]?.sent).toEqual([]);
    opened[0]?.receive({ type: 'pret', revision: 4 });
    await vi.waitFor(() =>
      expect(opened[0]?.sent).toEqual([
        { type: 'modification', id: expect.any(String), base: 4, operation: [7, ' !'] },
      ]),
    );
    const id = String(opened[0]?.sent[0]?.id);
    opened[0]?.receive({ type: 'operation', id, revision: 5, operation: [7, ' !'], author: null });
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('enregistre'));
    expect(controller.pending).toBe(false);
    controller.stop();
  });

  it('affiche aussitôt les modifications des autres', async () => {
    contentOnly('lundi', 1);
    const { opened, connect } = sockets();
    const { events, remote } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      connect,
      storage: memoryStorage(),
    });
    await controller.start();
    opened[0]?.receive({ type: 'pret', revision: 1 });
    opened[0]?.receive({
      type: 'operation',
      id: 'autre-0001',
      revision: 2,
      operation: ['Réunion ', 5],
      author: { id: 'u2', name: 'Bob' },
    });
    expect(remote).toEqual(['Réunion lundi']);
    controller.stop();
  });

  it('se reconnecte après une coupure et renvoie la même modification', async () => {
    contentOnly('', 0);
    const { opened, connect } = sockets();
    const { events, statuses } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      delayMs: 0,
      retryMs: [0],
      connect,
      storage: memoryStorage(),
    });
    await controller.start();
    opened[0]?.receive({ type: 'pret', revision: 0 });
    controller.change('a', 1);
    await vi.waitFor(() => expect(opened[0]?.sent).toHaveLength(1));
    opened[0]?.close();
    expect(statuses.at(-1)).toBe('hors-ligne');
    await vi.waitFor(() => expect(opened).toHaveLength(2));
    expect(opened[1]?.path).toBe('/api/documents/d1/direct?depuis=0');
    opened[1]?.receive({ type: 'pret', revision: 0 });
    await vi.waitFor(() => expect(opened[1]?.sent).toHaveLength(1));
    expect(opened[1]?.sent[0]).toEqual(opened[0]?.sent[0]);
    controller.stop();
  });

  it('reconnaît sa modification dans le rattrapage après une coupure', async () => {
    contentOnly('', 0);
    const { opened, connect } = sockets();
    const { events, statuses } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      delayMs: 0,
      retryMs: [0],
      connect,
      storage: memoryStorage(),
    });
    await controller.start();
    opened[0]?.receive({ type: 'pret', revision: 0 });
    controller.change('a', 1);
    await vi.waitFor(() => expect(opened[0]?.sent).toHaveLength(1));
    const id = String(opened[0]?.sent[0]?.id);
    opened[0]?.close();
    await vi.waitFor(() => expect(opened).toHaveLength(2));
    opened[1]?.receive({ type: 'operation', id, revision: 1, operation: ['a'], author: null });
    opened[1]?.receive({ type: 'pret', revision: 1 });
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('enregistre'));
    expect(opened[1]?.sent).toEqual([]);
    controller.stop();
  });

  it('repart de zéro si une version manque, et s’arrête sur un refus', async () => {
    contentOnly('x', 1);
    const { opened, connect } = sockets();
    const { events, statuses } = recorder();
    const controller = new EditionController('d1', 'cle', events, {
      retryMs: [0],
      connect,
      storage: memoryStorage(),
    });
    await controller.start();
    opened[0]?.receive({ type: 'pret', revision: 1 });
    opened[0]?.receive({
      type: 'operation',
      id: 'trou-0001',
      revision: 3,
      operation: [1],
      author: null,
    });
    expect(opened[0]?.closed).toBe(true);
    await vi.waitFor(() => expect(opened).toHaveLength(2));
    opened[1]?.receive({ type: 'erreur', status: 403, message: 'Lecture seule' });
    expect(statuses.at(-1)).toBe('erreur');
    expect(opened[1]?.closed).toBe(true);
  });
});
