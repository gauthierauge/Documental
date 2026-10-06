import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  CommunicationClientMessage,
  CommunicationServerMessage,
  VoiceServerSignal,
} from '@documental/contracts/communication';
import type { DocumentPerson } from '@documental/contracts/documents';

export type CommunicationStatus = 'connexion' | 'en-ligne' | 'hors-ligne';

function socketUrl(documentId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/documents/${encodeURIComponent(documentId)}/communication`;
}

function isSignal(message: CommunicationServerMessage): message is VoiceServerSignal {
  return !['pret', 'message', 'presence', 'erreur'].includes(message.type);
}

export function useCommunication(
  documentId: string,
  onSignal: (message: VoiceServerSignal) => void,
) {
  const socket = useRef<WebSocket | null>(null);
  const signalHandler = useRef(onSignal);
  const reconnect = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  const [status, setStatus] = useState<CommunicationStatus>('connexion');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<DocumentPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  signalHandler.current = onSignal;

  useEffect(() => {
    stopped.current = false;
    let failures = 0;

    function open() {
      if (stopped.current || socket.current) return;
      setStatus(failures ? 'hors-ligne' : 'connexion');
      const current = new WebSocket(socketUrl(documentId));
      socket.current = current;
      current.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        let message: CommunicationServerMessage;
        try {
          message = JSON.parse(event.data) as CommunicationServerMessage;
        } catch {
          return;
        }
        if (message.type === 'pret') {
          setMessages(message.messages);
          setStatus('en-ligne');
          setError(null);
          failures = 0;
        } else if (message.type === 'message') {
          setMessages((currentMessages) =>
            currentMessages.some((item) => item.id === message.message.id)
              ? currentMessages
              : [...currentMessages, message.message],
          );
        } else if (message.type === 'presence') {
          setParticipants(message.participants);
        } else if (message.type === 'erreur') {
          setError(message.message);
        } else if (isSignal(message)) {
          signalHandler.current(message);
        }
      };
      current.onclose = () => {
        if (socket.current !== current) return;
        socket.current = null;
        setStatus('hors-ligne');
        setParticipants([]);
        if (stopped.current) return;
        failures += 1;
        reconnect.current = setTimeout(open, Math.min(failures * 1_000, 10_000));
      };
    }

    open();
    return () => {
      stopped.current = true;
      if (reconnect.current) clearTimeout(reconnect.current);
      reconnect.current = null;
      const current = socket.current;
      socket.current = null;
      if (current) {
        current.onclose = null;
        current.close();
      }
    };
  }, [documentId]);

  const send = useCallback((message: CommunicationClientMessage): boolean => {
    const current = socket.current;
    if (!current || current.readyState !== WebSocket.OPEN) {
      setError('Communication hors ligne : réessayez dans un instant.');
      return false;
    }
    current.send(JSON.stringify(message));
    return true;
  }, []);

  return { status, messages, participants, error, setError, send };
}
