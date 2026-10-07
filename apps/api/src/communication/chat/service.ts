import { z } from 'zod';
import { CHAT_MESSAGE_MAX, type ChatMessage } from '@documental/contracts/communication';
import type { ChatStore } from '@/communication/chat/store';
import { CHAT_CHANNEL } from '@/communication/chat/store';
import type { CommunicationConnection } from '@/communication/connection';
import type { Listen } from '@/db/client';

const chatMessage = z
  .object({
    type: z.literal('message'),
    id: z.string().min(8).max(64),
    text: z.string().max(CHAT_MESSAGE_MAX),
  })
  .strict();

interface ChatRoom {
  members: Map<CommunicationConnection, number>;
  queue: Promise<void>;
}

export class ChatService {
  private readonly rooms = new Map<string, ChatRoom>();
  private listening: Promise<unknown> | null = null;

  constructor(
    private readonly store: ChatStore,
    private readonly listen: Listen,
  ) {}

  async connect(documentId: string, connection: CommunicationConnection): Promise<ChatMessage[]> {
    this.listening ??= this.listen(CHAT_CHANNEL, (id) => this.changed(id));
    await this.listening;
    const messages = await this.store.recent(documentId);
    const room = this.rooms.get(documentId) ?? { members: new Map(), queue: Promise.resolve() };
    this.rooms.set(documentId, room);
    room.members.set(connection, messages.at(-1)?.id ?? 0);
    return messages;
  }

  disconnect(documentId: string, connection: CommunicationConnection): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    room.members.delete(connection);
    if (room.members.size === 0) this.rooms.delete(documentId);
  }

  async receive(documentId: string, connection: CommunicationConnection, input: unknown) {
    const parsed = chatMessage.safeParse(input);
    if (!parsed.success) {
      connection.send({ type: 'erreur', message: 'Message invalide' });
      return;
    }
    const text = parsed.data.text.trim();
    if (!text) {
      connection.send({ type: 'erreur', message: 'Le message est vide.', id: parsed.data.id });
      return;
    }
    await this.store.send(documentId, connection.user.id, parsed.data.id, text);
  }

  private changed(documentId: string): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    room.queue = room.queue.then(() => this.deliver(documentId, room)).catch(() => undefined);
  }

  private async deliver(documentId: string, room: ChatRoom): Promise<void> {
    const members = [...room.members.entries()];
    if (members.length === 0) return;
    const after = Math.min(...members.map(([, lastMessageId]) => lastMessageId));
    const messages = await this.store.since(documentId, after);
    for (const [connection, lastMessageId] of members) {
      if (!room.members.has(connection)) continue;
      let latest = lastMessageId;
      for (const message of messages) {
        if (message.id <= latest) continue;
        connection.send({ type: 'message', message });
        latest = message.id;
      }
      room.members.set(connection, latest);
    }
  }
}
