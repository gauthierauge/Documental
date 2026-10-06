import { z } from 'zod';
import {
  CHAT_MESSAGE_MAX,
  type CommunicationServerMessage,
} from '@documental/contracts/communication';
import type { SessionUser } from '@/auth/middleware';
import type { Listen } from '@/db/client';
import { COMMUNICATION_CHANNEL, type CommunicationStore } from '@/communication/store';

const target = { to: z.string().min(1).max(128) };
const clientMessage = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('message'),
      id: z.string().min(8).max(64),
      text: z.string().max(CHAT_MESSAGE_MAX),
    })
    .strict(),
  z.object({ type: z.literal('vocal-rejoindre') }).strict(),
  z.object({ type: z.literal('vocal-quitter') }).strict(),
  z.object({ type: z.literal('vocal-etat'), muted: z.boolean() }).strict(),
  z.object({ type: z.literal('rtc-offre'), ...target, sdp: z.string().max(100_000) }).strict(),
  z.object({ type: z.literal('rtc-reponse'), ...target, sdp: z.string().max(100_000) }).strict(),
  z
    .object({
      type: z.literal('rtc-candidat'),
      ...target,
      candidate: z.string().max(10_000).nullable(),
    })
    .strict(),
]);

export interface CommunicationConnection {
  readonly user: SessionUser;
  send(message: CommunicationServerMessage): void;
  close(code: number, reason: string): void;
}

interface Member {
  connection: CommunicationConnection;
  lastMessageId: number;
  voice: boolean;
  muted: boolean;
  window: { start: number; count: number };
}

interface Room {
  members: Map<CommunicationConnection, Member>;
  queue: Promise<void>;
}

export class CommunicationHub {
  private readonly rooms = new Map<string, Room>();
  private listening: Promise<unknown> | null = null;

  constructor(
    private readonly store: CommunicationStore,
    private readonly listen: Listen,
    private readonly now: () => number = Date.now,
  ) {}

  async join(documentId: string, connection: CommunicationConnection): Promise<void> {
    this.listening ??= this.listen(COMMUNICATION_CHANNEL, (id) => this.changed(id));
    await this.listening;
    const messages = await this.store.recent(documentId);
    const room = this.rooms.get(documentId) ?? { members: new Map(), queue: Promise.resolve() };
    this.rooms.set(documentId, room);
    room.members.set(connection, {
      connection,
      lastMessageId: messages.at(-1)?.id ?? 0,
      voice: false,
      muted: false,
      window: { start: this.now(), count: 0 },
    });
    connection.send({ type: 'pret', messages });
    this.broadcastPresence(room);
    this.broadcastVoice(room);
  }

  leave(documentId: string, connection: CommunicationConnection): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    const wasInVoice = room.members.get(connection)?.voice ?? false;
    room.members.delete(connection);
    if (room.members.size === 0) this.rooms.delete(documentId);
    else {
      this.broadcastPresence(room);
      if (wasInVoice) this.broadcastVoice(room);
    }
  }

  async receive(
    documentId: string,
    connection: CommunicationConnection,
    raw: string,
  ): Promise<void> {
    const room = this.rooms.get(documentId);
    const member = room?.members.get(connection);
    if (!room || !member) return;
    if (this.overLimit(member)) {
      connection.close(1008, 'Trop de messages');
      return;
    }
    const parsed = clientMessage.safeParse(this.parse(raw));
    if (!parsed.success) {
      connection.send({ type: 'erreur', message: 'Message invalide' });
      return;
    }
    if (parsed.data.type === 'message') {
      const text = parsed.data.text.trim();
      if (!text) {
        connection.send({ type: 'erreur', message: 'Le message est vide.', id: parsed.data.id });
        return;
      }
      await this.store.send(documentId, connection.user.id, parsed.data.id, text);
      return;
    }
    if (parsed.data.type === 'vocal-rejoindre') {
      member.voice = true;
      member.muted = false;
      this.broadcastVoice(room);
      return;
    }
    if (parsed.data.type === 'vocal-quitter') {
      member.voice = false;
      member.muted = false;
      this.broadcastVoice(room);
      return;
    }
    if (parsed.data.type === 'vocal-etat') {
      if (!member.voice) return;
      member.muted = parsed.data.muted;
      this.broadcastVoice(room);
      return;
    }
    const outgoing = parsed.data;
    if (!member.voice) {
      connection.send({ type: 'erreur', message: 'Rejoignez le vocal avant de vous connecter.' });
      return;
    }
    if (outgoing.to === connection.user.id) {
      connection.send({ type: 'erreur', message: 'Vous ne pouvez pas vous appeler vous-même.' });
      return;
    }
    const targets = [...room.members.values()].filter(
      (candidate) => candidate.voice && candidate.connection.user.id === outgoing.to,
    );
    if (targets.length === 0) {
      connection.send({ type: 'erreur', message: 'Cette personne n’est plus en ligne.' });
      return;
    }
    const { to: _to, ...signal } = outgoing;
    for (const targetMember of targets) {
      targetMember.connection.send({ ...signal, from: this.person(connection.user) });
    }
  }

  private parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private overLimit(member: Member): boolean {
    const now = this.now();
    if (now - member.window.start >= 1_000) member.window = { start: now, count: 0 };
    member.window.count += 1;
    return member.window.count > 30;
  }

  private person(user: SessionUser) {
    return { id: user.id, name: user.name };
  }

  private broadcastPresence(room: Room): void {
    const unique = new Map<string, { id: string; name: string }>();
    for (const member of room.members.values()) {
      unique.set(member.connection.user.id, this.person(member.connection.user));
    }
    const message: CommunicationServerMessage = {
      type: 'presence',
      participants: [...unique.values()],
    };
    for (const member of room.members.values()) member.connection.send(message);
  }

  private broadcastVoice(room: Room): void {
    const unique = new Map<string, { id: string; name: string; muted: boolean }>();
    for (const member of room.members.values()) {
      if (!member.voice) continue;
      unique.set(member.connection.user.id, {
        ...this.person(member.connection.user),
        muted: member.muted,
      });
    }
    const message: CommunicationServerMessage = {
      type: 'vocal-presence',
      participants: [...unique.values()],
    };
    for (const member of room.members.values()) member.connection.send(message);
  }

  private changed(documentId: string): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    room.queue = room.queue.then(() => this.deliver(documentId, room)).catch(() => undefined);
  }

  private async deliver(documentId: string, room: Room): Promise<void> {
    const members = [...room.members.values()];
    if (members.length === 0) return;
    const after = Math.min(...members.map((member) => member.lastMessageId));
    const messages = await this.store.since(documentId, after);
    for (const member of members) {
      if (!room.members.has(member.connection)) continue;
      for (const chat of messages) {
        if (chat.id <= member.lastMessageId) continue;
        member.connection.send({ type: 'message', message: chat });
        member.lastMessageId = chat.id;
      }
    }
  }
}
