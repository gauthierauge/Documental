import type { DocumentPerson } from '@documental/contracts/documents';

export const CHAT_MESSAGE_MAX = 2_000;

export interface WebRtcConfiguration {
  iceServers: RTCIceServer[];
}

export interface ChatMessage {
  id: number;
  clientId: string;
  text: string;
  sentAt: string;
  author: DocumentPerson;
}

export interface VoiceParticipant extends DocumentPerson {
  muted: boolean;
}

export type VoiceSignal =
  | { type: 'rtc-offre'; to: string; sdp: string }
  | { type: 'rtc-reponse'; to: string; sdp: string }
  | { type: 'rtc-candidat'; to: string; candidate: string | null };

export type CommunicationClientMessage =
  | { type: 'message'; id: string; text: string }
  | { type: 'vocal-rejoindre' }
  | { type: 'vocal-quitter' }
  | { type: 'vocal-etat'; muted: boolean }
  | VoiceSignal;

type WithoutTarget<T> = T extends unknown ? Omit<T, 'to'> : never;
export type VoiceServerSignal =
  | { type: 'vocal-presence'; participants: VoiceParticipant[] }
  | ({ from: DocumentPerson } & WithoutTarget<VoiceSignal>);

export type CommunicationServerMessage =
  | { type: 'pret'; messages: ChatMessage[] }
  | { type: 'message'; message: ChatMessage }
  | { type: 'presence'; participants: DocumentPerson[] }
  | VoiceServerSignal
  | { type: 'erreur'; message: string; id?: string };
