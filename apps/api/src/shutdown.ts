export type Cleanup = () => unknown;

export const CLEANUP_MARGIN_MS = 2_000;

export class Shutdown {
  private readonly cleanups: Cleanup[] = [];
  private running: Promise<number> | null = null;

  constructor(private readonly log: (message: string, error?: unknown) => void = console.error) {}

  onShutdown(cleanup: Cleanup): void {
    this.cleanups.push(cleanup);
  }

  run(deadlineMs: number): Promise<number> {
    this.running ??= this.runAll(deadlineMs);
    return this.running;
  }

  private async runAll(deadlineMs: number): Promise<number> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<number>((resolve) => {
      timer = setTimeout(() => {
        this.log(`Arrêt : délai de ${deadlineMs} ms dépassé, sortie forcée`);
        resolve(1);
      }, deadlineMs);
    });
    try {
      return await Promise.race([this.closeAll(), late]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async closeAll(): Promise<number> {
    let code = 0;
    for (const cleanup of [...this.cleanups].reverse()) {
      try {
        await cleanup();
      } catch (error) {
        this.log('Arrêt : une fermeture a échoué', error);
        code = 1;
      }
    }
    return code;
  }
}

export interface StoppableServer {
  stop(closeActiveConnections?: boolean): Promise<void>;
}

export async function drainServer(server: StoppableServer, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'delai'>((resolve) => {
    timer = setTimeout(() => resolve('delai'), ms);
  });
  try {
    const result = await Promise.race([server.stop(false).then(() => 'fini' as const), timedOut]);
    if (result === 'delai') await server.stop(true);
  } finally {
    clearTimeout(timer);
  }
}

export interface SignalOptions {
  timeoutMs: number;
  exit?: (code: number) => void;
  signals?: { on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown };
}

export function stopOnSignals(shutdown: Shutdown, options: SignalOptions): void {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const signals = options.signals ?? process;
  let stopping = false;
  const stop = () => {
    if (stopping) {
      exit(1);
      return;
    }
    stopping = true;
    console.info(JSON.stringify({ heure: new Date().toISOString(), message: 'arrêt demandé' }));
    void shutdown.run(options.timeoutMs + CLEANUP_MARGIN_MS).then(exit);
  };
  signals.on('SIGTERM', stop);
  signals.on('SIGINT', stop);
}

const registry = new Shutdown();

export function onShutdown(cleanup: Cleanup): void {
  registry.onShutdown(cleanup);
}

export function handleShutdownSignals(timeoutMs: number): void {
  stopOnSignals(registry, { timeoutMs });
}
