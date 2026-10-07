import { z } from 'zod';
import { DOCUMENT_CONTENT_MAX, type ServerMessage } from '@documental/contracts/edition';
import { isValidOperation, type TextOperation } from '@documental/contracts/text-operation';
import { ACCOUNT_CHANNEL } from '@/admin/users';
import type { SessionUser } from '@/auth/middleware';
import type { Listen } from '@/db/client';
import { ACCESS_CHANNEL, accessTo } from '@/documents/access';
import type { DocumentStore } from '@/documents/store';
import { EDITION_CHANNEL, EditionError, type EditionStore } from '@/edition/store';

export const submissionSchema = z
  .object({
    id: z.string().min(8).max(64),
    base: z.number().int().min(0),
    operation: z.custom<TextOperation>(isValidOperation, 'Modification invalide'),
  })
  .strict();

const position = z.number().int().min(0).max(DOCUMENT_CONTENT_MAX);

const clientMessage = z.discriminatedUnion('type', [
  submissionSchema.extend({ type: z.literal('modification') }).strict(),
  z
    .object({ type: z.literal('curseur'), start: position, end: position })
    .strict()
    .refine((c) => c.start <= c.end, 'Sélection invalide'),
]);

export const CURSOR_CHANNEL = 'documental_curseurs';

const cursorSignal = z.object({
  d: z.string(),
  k: z.string(),
  x: z.enum(['curseur', 'depart', 'arrivee']),
  u: z.object({ id: z.string(), name: z.string() }).optional(),
  s: z.number().optional(),
  e: z.number().optional(),
});

export interface Connection {
  readonly user: SessionUser;
  send(message: ServerMessage): void;
  close(code: number, reason: string): void;
}

interface Member {
  key: string;
  connection: Connection;
  revision: number;
  ready: boolean;
  window: { start: number; count: number };
}

interface Room {
  members: Map<Connection, Member>;
  queue: Promise<void>;
}

export interface HubOptions {
  messagesPerSecond?: number;
  now?: () => number;
}

export class EditionHub {
  private readonly rooms = new Map<string, Room>();
  private listening: Promise<unknown> | null = null;
  private readonly messagesPerSecond: number;
  private readonly now: () => number;

  constructor(
    private readonly store: EditionStore,
    private readonly documents: DocumentStore,
    private readonly listen: Listen,
    options: HubOptions = {},
  ) {
    this.messagesPerSecond = options.messagesPerSecond ?? 30;
    this.now = options.now ?? Date.now;
  }

  async join(documentId: string, connection: Connection, since: number): Promise<void> {
    this.listening ??= Promise.all([
      this.listen(EDITION_CHANNEL, (id) => this.changed(id)),
      this.listen(ACCESS_CHANNEL, (id) => this.rightsChanged(id)),
      this.listen(CURSOR_CHANNEL, (payload) => this.cursorMoved(payload)),
      this.listen(ACCOUNT_CHANNEL, (userId) => this.blocked(userId)),
    ]);
    await this.listening;
    const room = this.rooms.get(documentId) ?? { members: new Map(), queue: Promise.resolve() };
    this.rooms.set(documentId, room);
    const key = crypto.randomUUID();
    room.members.set(connection, {
      key,
      connection,
      revision: since,
      ready: false,
      window: { start: this.now(), count: 0 },
    });
    await this.enqueue(documentId, room);
    await this.signal({ d: documentId, k: key, x: 'arrivee' });
  }

  leave(documentId: string, connection: Connection): void {
    const room = this.rooms.get(documentId);
    const member = room?.members.get(connection);
    if (!room || !member) return;
    room.members.delete(connection);
    if (room.members.size === 0) this.rooms.delete(documentId);
    void this.signal({ d: documentId, k: member.key, x: 'depart' }).catch(() => undefined);
  }

  size(documentId: string): number {
    return this.rooms.get(documentId)?.members.size ?? 0;
  }

  async receive(documentId: string, connection: Connection, raw: string): Promise<void> {
    const member = this.rooms.get(documentId)?.members.get(connection);
    if (!member) return;
    if (this.overLimit(member)) {
      connection.close(1008, 'Trop de messages');
      return;
    }
    let parsed: z.infer<typeof clientMessage>;
    try {
      parsed = clientMessage.parse(JSON.parse(raw));
    } catch {
      connection.send({ type: 'erreur', status: 400, message: 'Message invalide' });
      return;
    }
    if (parsed.type === 'curseur') {
      const { id, name } = connection.user;
      await this.signal({
        d: documentId,
        k: member.key,
        x: 'curseur',
        u: { id, name },
        s: parsed.start,
        e: parsed.end,
      });
      return;
    }
    try {
      await this.store.submit(
        documentId,
        { id: parsed.id, base: parsed.base, operation: parsed.operation },
        connection.user,
      );
    } catch (error) {
      if (!(error instanceof EditionError)) throw error;
      connection.send({
        type: 'erreur',
        status: error.status,
        message: error.message,
        id: parsed.id,
      });
    }
  }

  private blocked(userId: string): void {
    for (const room of this.rooms.values()) {
      for (const member of room.members.values()) {
        if (member.connection.user.id !== userId) continue;
        member.connection.send({
          type: 'erreur',
          status: 401,
          message: 'Session terminée : ce compte est bloqué.',
        });
        member.connection.close(4401, 'Compte bloqué');
      }
    }
  }

  private signal(payload: z.infer<typeof cursorSignal>): Promise<void> {
    return this.store.notify(CURSOR_CHANNEL, JSON.stringify(payload));
  }

  private cursorMoved(payload: string): void {
    let signal: z.infer<typeof cursorSignal>;
    try {
      signal = cursorSignal.parse(JSON.parse(payload));
    } catch {
      return;
    }
    const room = this.rooms.get(signal.d);
    if (!room) return;
    for (const member of room.members.values()) {
      if (member.key === signal.k || !member.ready) continue;
      if (signal.x === 'depart') {
        member.connection.send({ type: 'depart', key: signal.k });
      } else if (signal.x === 'arrivee') {
        member.connection.send({ type: 'arrivee' });
      } else if (signal.u && signal.s !== undefined && signal.e !== undefined) {
        member.connection.send({
          type: 'curseur',
          key: signal.k,
          user: signal.u,
          start: signal.s,
          end: signal.e,
        });
      }
    }
  }

  private overLimit(member: Member): boolean {
    const now = this.now();
    if (now - member.window.start >= 1_000) member.window = { start: now, count: 0 };
    member.window.count += 1;
    return member.window.count > this.messagesPerSecond;
  }

  private changed(documentId: string): void {
    const room = this.rooms.get(documentId);
    if (room) void this.enqueue(documentId, room);
  }

  private rightsChanged(documentId: string): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    room.queue = room.queue
      .then(async () => {
        const item = await this.documents.get(documentId);
        if (!item) return;
        for (const member of room.members.values()) {
          const access = await accessTo(this.documents, member.connection.user, item);
          member.connection.send({ type: 'droits', canEdit: access.write });
        }
      })
      .catch(() => undefined);
  }

  private enqueue(documentId: string, room: Room): Promise<void> {
    room.queue = room.queue.then(() => this.deliver(documentId, room)).catch(() => undefined);
    return room.queue;
  }

  private async deliver(documentId: string, room: Room): Promise<void> {
    const members = [...room.members.values()];
    if (members.length === 0) return;
    const from = Math.min(...members.map((m) => m.revision));
    const operations = await this.store.since(documentId, from);
    for (const member of members) {
      if (!room.members.has(member.connection)) continue;
      for (const operation of operations) {
        if (operation.revision <= member.revision) continue;
        member.connection.send({ type: 'operation', ...operation });
        member.revision = operation.revision;
      }
      if (!member.ready) {
        member.ready = true;
        member.connection.send({ type: 'pret', revision: member.revision });
      }
    }
  }
}
