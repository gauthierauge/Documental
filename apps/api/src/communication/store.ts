import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { ChatMessage } from '@documental/contracts/communication';
import type { Db } from '@/db/client';
import { documentMessage, user } from '@/db/schema';

export const COMMUNICATION_CHANNEL = 'documental_communication';

const columns = {
  id: documentMessage.id,
  clientId: documentMessage.clientId,
  text: documentMessage.text,
  sentAt: documentMessage.sentAt,
  authorId: user.id,
  authorName: user.name,
};

type MessageRow = {
  id: number;
  clientId: string;
  text: string;
  sentAt: Date;
  authorId: string;
  authorName: string;
};

function message(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    clientId: row.clientId,
    text: row.text,
    sentAt: row.sentAt.toISOString(),
    author: { id: row.authorId, name: row.authorName },
  };
}

export class CommunicationStore {
  constructor(private readonly db: Db) {}

  async recent(documentId: string, limit = 50): Promise<ChatMessage[]> {
    const rows = await this.db
      .select(columns)
      .from(documentMessage)
      .innerJoin(user, eq(user.id, documentMessage.authorId))
      .where(eq(documentMessage.documentId, documentId))
      .orderBy(desc(documentMessage.id))
      .limit(limit);
    return rows.reverse().map(message);
  }

  async since(documentId: string, after: number): Promise<ChatMessage[]> {
    const rows = await this.db
      .select(columns)
      .from(documentMessage)
      .innerJoin(user, eq(user.id, documentMessage.authorId))
      .where(and(eq(documentMessage.documentId, documentId), gt(documentMessage.id, after)))
      .orderBy(asc(documentMessage.id));
    return rows.map(message);
  }

  async send(documentId: string, authorId: string, clientId: string, text: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(documentMessage)
        .values({ documentId, authorId, clientId, text })
        .onConflictDoNothing();
      await tx.execute(sql`select pg_notify(${COMMUNICATION_CHANNEL}, ${documentId})`);
    });
  }
}
