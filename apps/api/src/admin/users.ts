import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { strongFactors } from '@/auth/admin-access';
import type { Db } from '@/db/client';
import { session, user } from '@/db/schema';
import type { Role } from '@documental/contracts/admin-types';

export const ACCOUNT_CHANNEL = 'documental_comptes';

export interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
  strongFactor: string | null;
  createdAt: Date;
  blockedAt: Date | null;
}

export class Accounts {
  private readonly db: any;

  constructor(private readonly typedDb: Db) {
    this.db = typedDb;
  }

  async list(): Promise<Account[]> {
    const rows = await this.db.select().from(user).orderBy(asc(user.email));
    const strong = await strongFactors(this.typedDb);
    return rows.map((r: Account & Record<string, unknown>) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      strongFactor: strong.get(r.id) ?? null,
      createdAt: r.createdAt,
      blockedAt: r.blockedAt ?? null,
    }));
  }

  async byEmail(email: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    return row ?? null;
  }

  async get(
    id: string,
  ): Promise<{ id: string; email: string; role: Role; blockedAt: Date | null } | null> {
    const [row] = await this.db
      .select({ id: user.id, email: user.email, role: user.role, blockedAt: user.blockedAt })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return row ?? null;
  }

  async invite(email: string, name: string, role: Role): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(user)
      .values({ email, name, role })
      .returning({ id: user.id });
    return row;
  }

  async setRole(id: string, role: Role): Promise<void> {
    await this.db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
    await this.db.delete(session).where(eq(session.userId, id));
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(user).where(eq(user.id, id));
  }

  async setBlocked(id: string, blocked: boolean): Promise<void> {
    await this.db
      .update(user)
      .set({ blockedAt: blocked ? new Date() : null, updatedAt: new Date() })
      .where(eq(user.id, id));
    if (blocked) {
      await this.db.delete(session).where(eq(session.userId, id));
      await this.db.execute(sql`select pg_notify(${ACCOUNT_CHANNEL}, ${id})`);
    }
  }

  async activeAdminCount(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(user)
      .where(and(eq(user.role, 'admin'), isNull(user.blockedAt)));
    return Number(row?.n ?? 0);
  }

  async adminCount(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(user).where(eq(user.role, 'admin'));
    return Number(row?.n ?? 0);
  }
}
