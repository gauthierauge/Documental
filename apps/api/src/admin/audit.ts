import { count, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { auditLog } from '@/db/schema';

export interface Actor {
  id: string;
  email: string;
}

export interface AuditEntry {
  id: string;
  at: Date;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  changes: unknown;
}

export class AuditLog {
  constructor(private readonly db: Db) {}

  async record(
    actor: Actor,
    entry: {
      action: string;
      entity: string;
      entityId?: string | null;
      summary: string;
      changes?: unknown;
    },
  ): Promise<void> {
    await (this.db as any).insert(auditLog).values({
      userId: actor.id,
      userEmail: actor.email,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      changes: entry.changes ?? null,
    });
  }

  async list(
    page = 1,
    perPage = 50,
    entity?: string,
  ): Promise<{ rows: AuditEntry[]; total: number }> {
    const db = this.db as any;
    const where = entity ? eq(auditLog.entity, entity) : undefined;
    const rows = await db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.at))
      .limit(perPage)
      .offset((Math.max(page, 1) - 1) * perPage);
    const [counted] = await db.select({ n: count() }).from(auditLog).where(where);
    return { rows, total: Number(counted?.n ?? 0) };
  }
}

export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const [key, value] of Object.entries(after)) {
    if (key === 'updated_at' || key === 'created_at') continue;
    const old = before[key] ?? null;
    if (JSON.stringify(old) !== JSON.stringify(value ?? null)) out[key] = [old, value ?? null];
  }
  return out;
}
