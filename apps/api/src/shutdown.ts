// Arrêt propre sur SIGTERM (docker stop, hébergeur qui redéploie) et SIGINT (Ctrl+C) : le
// serveur cesse d'accepter des connexions, laisse finir les requêtes en cours, puis ce qui a été
// ouvert au démarrage est fermé (tâches planifiées, base…), dans l'ordre inverse d'ouverture.
// Chaque module s'inscrit avec `onShutdown(fn)` juste après avoir ouvert sa ressource.

export type Cleanup = () => unknown;

/** Temps laissé aux fermetures après l'attente des requêtes (docker stop tue au bout de 10 s). */
export const CLEANUP_MARGIN_MS = 2_000;

export class Shutdown {
  private readonly cleanups: Cleanup[] = [];
  private running: Promise<number> | null = null;

  constructor(private readonly log: (message: string, error?: unknown) => void = console.error) {}

  onShutdown(cleanup: Cleanup): void {
    this.cleanups.push(cleanup);
  }

  /**
   * Exécute les fermetures, de la dernière inscrite à la première, une seule fois même si on
   * l'appelle plusieurs fois. Renvoie le code de sortie : 0, ou 1 si une fermeture a échoué ou
   * si le délai est dépassé.
   */
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

/** Ce que l'arrêt demande au serveur HTTP (Bun.serve). */
export interface StoppableServer {
  stop(closeActiveConnections?: boolean): Promise<void>;
}

/**
 * Cesse d'accepter des connexions et attend la fin des requêtes en cours, au plus `ms`
 * millisecondes ; au-delà, les connexions restantes sont coupées.
 */
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
  /** Délai d'attente des requêtes ; les fermetures ont CLEANUP_MARGIN_MS de plus. */
  timeoutMs: number;
  exit?: (code: number) => void;
  signals?: { on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown };
}

/** Branche l'arrêt sur SIGTERM et SIGINT. Un second signal force la sortie. */
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

/** Le registre du serveur : `onShutdown(() => database.close())`. */
const registry = new Shutdown();

export function onShutdown(cleanup: Cleanup): void {
  registry.onShutdown(cleanup);
}

/** Démarre l'écoute des signaux pour le registre du serveur. */
export function handleShutdownSignals(timeoutMs: number): void {
  stopOnSignals(registry, { timeoutMs });
}
