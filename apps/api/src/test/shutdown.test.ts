import { drainServer, Shutdown, type StoppableServer, stopOnSignals } from '@/shutdown';

function fakeServer(requestMs: number) {
  const calls: string[] = [];
  const server: StoppableServer = {
    async stop(force) {
      calls.push(force ? 'coupe' : 'cesse d’accepter');
      if (!force) await new Promise((resolve) => setTimeout(resolve, requestMs));
    },
  };
  return { server, calls };
}

describe('arrêt propre', () => {
  it('laisse finir les requêtes en cours dans le délai', async () => {
    const { server, calls } = fakeServer(20);
    await drainServer(server, 1_000);
    expect(calls).toEqual(['cesse d’accepter']);
  });

  it('coupe les connexions restantes une fois le délai passé', async () => {
    const { server, calls } = fakeServer(1_000);
    await drainServer(server, 20);
    expect(calls).toEqual(['cesse d’accepter', 'coupe']);
  });

  it('ferme dans l’ordre inverse d’ouverture : serveur, puis tâches, puis base', async () => {
    const order: string[] = [];
    const shutdown = new Shutdown(() => {});
    shutdown.onShutdown(() => order.push('base'));
    shutdown.onShutdown(async () => order.push('tâches'));
    shutdown.onShutdown(() => order.push('serveur'));
    expect(await shutdown.run(1_000)).toBe(0);
    expect(order).toEqual(['serveur', 'tâches', 'base']);
  });

  it('continue après une fermeture en échec, et sort en erreur', async () => {
    const closed: string[] = [];
    const shutdown = new Shutdown(() => {});
    shutdown.onShutdown(() => closed.push('base'));
    shutdown.onShutdown(() => {
      throw new Error('échec');
    });
    expect(await shutdown.run(1_000)).toBe(1);
    expect(closed).toEqual(['base']);
  });

  it('ne dépasse pas le délai, même si une fermeture ne rend jamais la main', async () => {
    const shutdown = new Shutdown(() => {});
    shutdown.onShutdown(() => new Promise(() => {}));
    expect(await shutdown.run(20)).toBe(1);
  });

  it('SIGTERM lance l’arrêt une fois ; un second signal force la sortie', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const listeners = new Map<string, () => void>();
    const exits: number[] = [];
    const shutdown = new Shutdown(() => {});
    let closes = 0;
    shutdown.onShutdown(() => {
      closes += 1;
    });
    stopOnSignals(shutdown, {
      timeoutMs: 100,
      exit: (code) => exits.push(code),
      signals: { on: (signal, listener) => listeners.set(signal, listener) },
    });
    listeners.get('SIGTERM')?.();
    await vi.waitFor(() => expect(exits).toEqual([0]));
    listeners.get('SIGINT')?.();
    expect(exits).toEqual([0, 1]);
    expect(closes).toBe(1);
    vi.restoreAllMocks();
  });
});
