import type { Db } from '@/db/client';
import { appSettings } from '@/db/schema';
import type { SettingConfig } from '@documental/contracts/admin-types';

export class SettingsStore {
  constructor(
    private readonly db: Db,
    private readonly config: readonly SettingConfig[],
  ) {}

  async all(): Promise<Record<string, unknown>> {
    const rows: { key: string; value: unknown }[] = await (this.db as any)
      .select()
      .from(appSettings);
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(this.config.map((s) => [s.key, stored.get(s.key) ?? null]));
  }

  async publicValues(): Promise<Record<string, unknown>> {
    const all = await this.all();
    return Object.fromEntries(this.config.filter((s) => s.public).map((s) => [s.key, all[s.key]]));
  }

  async set(values: Record<string, unknown>, userId: string): Promise<void> {
    const db = this.db as any;
    for (const [key, value] of Object.entries(values)) {
      await db
        .insert(appSettings)
        .values({ key, value, updatedAt: new Date(), updatedBy: userId })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: new Date(), updatedBy: userId },
        });
    }
  }
}
