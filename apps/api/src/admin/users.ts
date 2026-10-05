import { asc, count, eq } from 'drizzle-orm';
import { strongFactors } from '@/auth/admin-access';
import type { Db } from '@/db/client';
import { session, user } from '@/db/schema';
import type { Role } from '@documental/contracts/admin-types';

// Les comptes : on invite, on change le rôle, on retire l'accès. Pas d'inscription libre.

export interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Le facteur fort du compte (passkeys, double authentification…), null s'il n'en a pas. */
  strongFactor: string | null;
  createdAt: Date;
}

export class Accounts {
  // oxlint-disable-next-line typescript/no-explicit-any -- requêtes communes aux deux dialectes.
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

  async get(id: string): Promise<{ id: string; email: string; role: Role } | null> {
    const [row] = await this.db
      .select({ id: user.id, email: user.email, role: user.role })
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
    // Le nouveau rôle s'applique tout de suite : les sessions ouvertes sont fermées.
    await this.db.delete(session).where(eq(session.userId, id));
  }

  async remove(id: string): Promise<void> {
    // Sessions et facteurs d'authentification partent avec le compte (suppression en cascade).
    await this.db.delete(user).where(eq(user.id, id));
  }

  async adminCount(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(user).where(eq(user.role, 'admin'));
    return Number(row?.n ?? 0);
  }
}
