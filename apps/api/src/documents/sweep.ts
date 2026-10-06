export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
export const SWEEP_EVERY_MS = 60 * 60 * 1000;

export interface Sweeper {
  run(now?: number): Promise<number>;
}

export function orphanSweeper(
  collect: (before: Date) => Promise<number>,
  options: { graceMs?: number; everyMs?: number; onError?: (error: unknown) => void } = {},
): Sweeper {
  const graceMs = options.graceMs ?? ORPHAN_GRACE_MS;
  const everyMs = options.everyMs ?? SWEEP_EVERY_MS;
  let last = 0;
  let running = false;

  return {
    async run(now = Date.now()) {
      if (running || (last !== 0 && now - last < everyMs)) return 0;
      last = now;
      running = true;
      try {
        return await collect(new Date(now - graceMs));
      } catch (error) {
        options.onError?.(error);
        return 0;
      } finally {
        running = false;
      }
    },
  };
}
