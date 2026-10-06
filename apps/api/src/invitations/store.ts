import { and, asc, eq, ilike, notInArray, or, sql } from 'drizzle-orm';
import type { Collaborator, InvitableAccount } from '@documental/contracts/documents';
import type { Db } from '@/db/client';
import { documentCollaborator, user } from '@/db/schema';
import { ACCESS_CHANNEL } from '@/documents/access';

const SEARCH_LIMIT = 8;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class InvitationStore {
  constructor(private readonly db: Db) {}

  async list(documentId: string): Promise<Collaborator[]> {
    const rows = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        invitedAt: documentCollaborator.createdAt,
      })
      .from(documentCollaborator)
      .innerJoin(user, eq(user.id, documentCollaborator.userId))
      .where(eq(documentCollaborator.documentId, documentId))
      .orderBy(asc(user.name));
    return rows.map((row) => ({ ...row, invitedAt: row.invitedAt.toISOString() }));
  }

  async account(userId: string): Promise<InvitableAccount | null> {
    const [row] = await this.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    return row ?? null;
  }

  async search(query: string, excluded: string[]): Promise<InvitableAccount[]> {
    const pattern = `%${escapeLike(query)}%`;
    return this.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(
        and(
          or(ilike(user.name, pattern), ilike(user.email, pattern)),
          excluded.length ? notInArray(user.id, excluded) : undefined,
        ),
      )
      .orderBy(asc(user.name))
      .limit(SEARCH_LIMIT);
  }

  async add(documentId: string, userId: string, invitedBy: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const created = await tx
        .insert(documentCollaborator)
        .values({ documentId, userId, invitedBy })
        .onConflictDoNothing()
        .returning({ userId: documentCollaborator.userId });
      if (created.length) {
        await tx.execute(sql`select pg_notify(${ACCESS_CHANNEL}, ${documentId})`);
      }
      return created.length > 0;
    });
  }

  async remove(documentId: string, userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(documentCollaborator)
        .where(
          and(
            eq(documentCollaborator.documentId, documentId),
            eq(documentCollaborator.userId, userId),
          ),
        )
        .returning({ userId: documentCollaborator.userId });
      if (removed.length) {
        await tx.execute(sql`select pg_notify(${ACCESS_CHANNEL}, ${documentId})`);
      }
      return removed.length > 0;
    });
  }
}
