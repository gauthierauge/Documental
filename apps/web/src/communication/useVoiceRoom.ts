import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CommunicationClientMessage,
  VoiceParticipant,
  VoiceServerSignal,
  WebRtcConfiguration,
} from '@documental/contracts/communication';
import type { DocumentPerson } from '@documental/contracts/documents';
import { api } from '@/api';

interface Peer {
  connection: RTCPeerConnection;
  audio: HTMLAudioElement;
  candidates: (string | null)[];
}

export type VoiceStatus = 'hors-vocal' | 'connexion' | 'dans-vocal' | 'erreur';

export function useVoiceRoom(
  user: DocumentPerson,
  send: (message: CommunicationClientMessage) => boolean,
) {
  const [status, setStatus] = useState<VoiceStatus>('hors-vocal');
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joined = useRef(false);
  const local = useRef<MediaStream | null>(null);
  const configuration = useRef<RTCConfiguration | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const deafenedRef = useRef(false);

  const closePeer = useCallback((id: string) => {
    const peer = peers.current.get(id);
    if (!peer) return;
    peer.connection.onconnectionstatechange = null;
    peer.connection.onicecandidate = null;
    peer.connection.ontrack = null;
    peer.connection.close();
    peer.audio.pause();
    peer.audio.srcObject = null;
    peers.current.delete(id);
  }, []);

  const clean = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id);
    for (const track of local.current?.getTracks() ?? []) track.stop();
    local.current = null;
    configuration.current = null;
    joined.current = false;
    setParticipants([]);
    setMuted(false);
    setDeafened(false);
    deafenedRef.current = false;
  }, [closePeer]);

  useEffect(() => clean, [clean]);

  const ensurePeer = useCallback(
    (person: DocumentPerson): Peer | null => {
      const existing = peers.current.get(person.id);
      if (existing) return existing;
      if (!joined.current || !local.current || !configuration.current) return null;
      const connection = new RTCPeerConnection(configuration.current);
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = deafenedRef.current;
      const peer: Peer = { connection, audio, candidates: [] };
      peers.current.set(person.id, peer);
      for (const track of local.current.getTracks()) connection.addTrack(track, local.current);
      connection.onicecandidate = (event) => {
        send({
          type: 'rtc-candidat',
          to: person.id,
          candidate: event.candidate ? JSON.stringify(event.candidate.toJSON()) : null,
        });
      };
      connection.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => undefined);
      };
      connection.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(connection.connectionState)) closePeer(person.id);
      };
      return peer;
    },
    [closePeer, send],
  );

  const flush = useCallback(async (peer: Peer) => {
    if (!peer.connection.remoteDescription) return;
    for (const candidate of peer.candidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate ? JSON.parse(candidate) : null);
    }
  }, []);

  const offer = useCallback(
    async (person: DocumentPerson) => {
      const peer = ensurePeer(person);
      if (!peer) return;
      const description = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(description);
      send({ type: 'rtc-offre', to: person.id, sdp: description.sdp ?? '' });
    },
    [ensurePeer, send],
  );

  const syncParticipants = useCallback(
    (next: VoiceParticipant[]) => {
      setParticipants(next);
      if (!joined.current) return;
      const present = new Set(next.map((person) => person.id));
      for (const id of [...peers.current.keys()]) {
        if (!present.has(id)) closePeer(id);
      }
      for (const person of next) {
        if (
          person.id !== user.id &&
          user.id.localeCompare(person.id) < 0 &&
          !peers.current.has(person.id)
        ) {
          void offer(person).catch(() =>
            setError('Connexion audio impossible avec un participant.'),
          );
        }
      }
    },
    [closePeer, offer, user.id],
  );

  const handle = useCallback(
    async (signal: VoiceServerSignal) => {
      if (signal.type === 'vocal-presence') {
        syncParticipants(signal.participants);
        return;
      }
      if (!joined.current) return;
      try {
        const peer = ensurePeer(signal.from);
        if (!peer) return;
        if (signal.type === 'rtc-offre') {
          await peer.connection.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          await flush(peer);
          const answer = await peer.connection.createAnswer();
          await peer.connection.setLocalDescription(answer);
          send({ type: 'rtc-reponse', to: signal.from.id, sdp: answer.sdp ?? '' });
        } else if (signal.type === 'rtc-reponse') {
          await peer.connection.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          await flush(peer);
        } else if (peer.connection.remoteDescription) {
          await peer.connection.addIceCandidate(
            signal.candidate ? JSON.parse(signal.candidate) : null,
          );
        } else {
          peer.candidates.push(signal.candidate);
        }
      } catch {
        setError('Une connexion audio n’a pas pu être établie.');
      }
    },
    [ensurePeer, flush, send, syncParticipants],
  );

  const join = useCallback(async () => {
    if (joined.current || status === 'connexion') return;
    setStatus('connexion');
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone indisponible');
      configuration.current = await api<WebRtcConfiguration>('/communication/webrtc');
      local.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      joined.current = true;
      if (!send({ type: 'vocal-rejoindre' })) throw new Error('Salon hors ligne');
      setStatus('dans-vocal');
    } catch {
      clean();
      setStatus('erreur');
      setError('Le vocal est indisponible ou l’accès au microphone a été refusé.');
    }
  }, [clean, send, status]);

  const leave = useCallback(
    (notify = true) => {
      if (notify && joined.current) send({ type: 'vocal-quitter' });
      clean();
      setStatus('hors-vocal');
      setError(null);
    },
    [clean, send],
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    for (const track of local.current?.getAudioTracks() ?? []) track.enabled = !next;
    setMuted(next);
    send({ type: 'vocal-etat', muted: next });
  }, [muted, send]);

  const toggleDeafen = useCallback(() => {
    const next = !deafened;
    deafenedRef.current = next;
    for (const peer of peers.current.values()) peer.audio.muted = next;
    setDeafened(next);
  }, [deafened]);

  return {
    status,
    participants,
    muted,
    deafened,
    error,
    join,
    leave,
    handle,
    toggleMute,
    toggleDeafen,
  };
}
