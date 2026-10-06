import { z } from 'zod';
import type { CommunicationServerMessage } from '@documental/contracts/communication';
import type { CommunicationConnection } from '@/communication/connection';

const target = { to: z.string().min(1).max(128) };
const voiceMessage = z.discriminatedUnion('type', [
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

interface VoiceMember {
  connection: CommunicationConnection;
  joined: boolean;
  muted: boolean;
}

export class VoiceService {
  private readonly rooms = new Map<string, Map<CommunicationConnection, VoiceMember>>();

  connect(documentId: string, connection: CommunicationConnection): void {
    const room = this.rooms.get(documentId) ?? new Map();
    this.rooms.set(documentId, room);
    room.set(connection, { connection, joined: false, muted: false });
    this.broadcast(room);
  }

  disconnect(documentId: string, connection: CommunicationConnection): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    const wasJoined = room.get(connection)?.joined ?? false;
    room.delete(connection);
    if (room.size === 0) this.rooms.delete(documentId);
    else if (wasJoined) this.broadcast(room);
  }

  receive(documentId: string, connection: CommunicationConnection, input: unknown): void {
    const room = this.rooms.get(documentId);
    const member = room?.get(connection);
    if (!room || !member) return;
    const parsed = voiceMessage.safeParse(input);
    if (!parsed.success) {
      connection.send({ type: 'erreur', message: 'Message invalide' });
      return;
    }
    if (parsed.data.type === 'vocal-rejoindre') {
      member.joined = true;
      member.muted = false;
      this.broadcast(room);
      return;
    }
    if (parsed.data.type === 'vocal-quitter') {
      member.joined = false;
      member.muted = false;
      this.broadcast(room);
      return;
    }
    if (parsed.data.type === 'vocal-etat') {
      if (!member.joined) return;
      member.muted = parsed.data.muted;
      this.broadcast(room);
      return;
    }
    if (!member.joined) {
      connection.send({ type: 'erreur', message: 'Rejoignez le vocal avant de vous connecter.' });
      return;
    }
    const outgoing = parsed.data;
    if (outgoing.to === connection.user.id) {
      connection.send({ type: 'erreur', message: 'Vous ne pouvez pas vous appeler vous-même.' });
      return;
    }
    const targets = [...room.values()].filter(
      (candidate) => candidate.joined && candidate.connection.user.id === outgoing.to,
    );
    if (targets.length === 0) {
      connection.send({ type: 'erreur', message: 'Cette personne n’est plus en ligne.' });
      return;
    }
    const { to: _to, ...signal } = outgoing;
    for (const targetMember of targets) {
      targetMember.connection.send({ ...signal, from: this.person(connection) });
    }
  }

  private person(connection: CommunicationConnection) {
    return { id: connection.user.id, name: connection.user.name };
  }

  private broadcast(room: Map<CommunicationConnection, VoiceMember>): void {
    const unique = new Map<string, { id: string; name: string; muted: boolean }>();
    for (const member of room.values()) {
      if (!member.joined) continue;
      unique.set(member.connection.user.id, {
        ...this.person(member.connection),
        muted: member.muted,
      });
    }
    const message: CommunicationServerMessage = {
      type: 'vocal-presence',
      participants: [...unique.values()],
    };
    for (const member of room.values()) member.connection.send(message);
  }
}
