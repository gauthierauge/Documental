import { ORPHAN_GRACE_MS, orphanSweeper, SWEEP_EVERY_MS } from '@/documents/sweep';

describe('orphanSweeper', () => {
  it('balaie au premier appel, puis se tait jusqu’au prochain tour', async () => {
    const collect = vi.fn(async () => 3);
    const sweeper = orphanSweeper(collect, { everyMs: 1_000 });

    expect(await sweeper.run(10_000)).toBe(3);
    expect(await sweeper.run(10_500)).toBe(0);
    expect(await sweeper.run(11_000)).toBe(3);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it('ne ramasse que ce qui a passé le délai de grâce', async () => {
    const collect = vi.fn(async () => 0);
    const sweeper = orphanSweeper(collect, { graceMs: 60_000 });

    await sweeper.run(1_000_000);

    expect(collect).toHaveBeenCalledWith(new Date(940_000));
  });

  it('ne lance pas deux balayages en même temps', async () => {
    let resolve = (_: number) => {};
    const collect = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const sweeper = orphanSweeper(collect, { everyMs: 0 });

    const premier = sweeper.run(1_000);
    const second = sweeper.run(2_000);
    resolve(1);

    expect(await premier).toBe(1);
    expect(await second).toBe(0);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('survit à une erreur de base, et réessaiera au tour suivant', async () => {
    const onError = vi.fn();
    const collect = vi.fn(async () => {
      throw new Error('base indisponible');
    });
    const sweeper = orphanSweeper(collect, { everyMs: 1_000, onError });

    expect(await sweeper.run(10_000)).toBe(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(await sweeper.run(11_000)).toBe(0);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it('a des valeurs par défaut prudentes : une journée de grâce, un tour par heure', () => {
    expect(ORPHAN_GRACE_MS).toBe(86_400_000);
    expect(SWEEP_EVERY_MS).toBe(3_600_000);
  });
});
