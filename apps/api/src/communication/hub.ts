import type { CommunicationServerMessage } from '@documental/contracts/communication';
import type { ChatService } from '@/communication/chat/service';
import type { CommunicationConnection } from '@/communication/connection';
import type { VoiceService } from '@/communication/voice/service';

interface Member {
  connection: CommunicationConnection;
  window: { start: number; count: number };
}

export class CommunicationHub {
  private readonly rooms = new Map<string, Map<CommunicationConnection, Member>>();

  constructor(
    private readonly chat: ChatService,
    private readonly voice: VoiceService,
    private readonly now: () => number = Date.now,
  ) {}

  async join(documentId: string, connection: CommunicationConnection): Promise<void> {
    const messages = await this.chat.connect(documentId, connection);
    const room = this.rooms.get(documentId) ?? new Map();
    this.rooms.set(documentId, room);
    room.set(connection, {
      connection,
      window: { start: this.now(), count: 0 },
    });
    connection.send({ type: 'pret', messages });
    this.broadcastPresence(room);
    this.voice.connect(documentId, connection);
  }

  leave(documentId: string, connection: CommunicationConnection): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    room.delete(connection);
    this.chat.disconnect(documentId, connection);
    this.voice.disconnect(documentId, connection);
    if (room.size === 0) this.rooms.delete(documentId);
    else this.broadcastPresence(room);
  }

  async receive(
    documentId: string,
    connection: CommunicationConnection,
    raw: string,
  ): Promise<void> {
    const member = this.rooms.get(documentId)?.get(connection);
    if (!member) return;
    if (this.overLimit(member)) {
      connection.close(1008, 'Trop de messages');
      return;
    }
    const input = this.parse(raw);
    if (!this.hasType(input)) {
      connection.send({ type: 'erreur', message: 'Message invalide' });
      return;
    }
    if (input.type === 'message') await this.chat.receive(documentId, connection, input);
    else this.voice.receive(documentId, connection, input);
  }

  private parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private hasType(value: unknown): value is { type: string } {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  private overLimit(member: Member): boolean {
    const now = this.now();
    if (now - member.window.start >= 1_000) member.window = { start: now, count: 0 };
    member.window.count += 1;
    return member.window.count > 30;
  }

  private broadcastPresence(room: Map<CommunicationConnection, Member>): void {
    const unique = new Map<string, { id: string; name: string }>();
    for (const member of room.values()) {
      unique.set(member.connection.user.id, {
        id: member.connection.user.id,
        name: member.connection.user.name,
      });
    }
    const message: CommunicationServerMessage = {
      type: 'presence',
      participants: [...unique.values()],
    };
    for (const member of room.values()) member.connection.send(message);
  }
}
