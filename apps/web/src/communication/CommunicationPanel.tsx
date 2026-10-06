import { useEffect, useRef } from 'react';
import type { VoiceServerSignal } from '@documental/contracts/communication';
import type { DocumentPerson } from '@documental/contracts/documents';
import { ChatPanel } from '@/communication/ChatPanel';
import { useCommunication } from '@/communication/useCommunication';
import { useVoiceRoom } from '@/communication/useVoiceRoom';
import { VoicePanel } from '@/communication/VoicePanel';
import '@/communication/communication.css';

export function CommunicationPanel({
  documentId,
  user,
}: {
  documentId: string;
  user: DocumentPerson;
}) {
  const signal = useRef<(message: VoiceServerSignal) => void>(() => undefined);
  const communication = useCommunication(documentId, (message) => signal.current(message));
  const voice = useVoiceRoom(user, communication.send);
  signal.current = voice.handle;

  useEffect(() => {
    if (communication.status === 'hors-ligne' && voice.status === 'dans-vocal') voice.leave(false);
  }, [communication.status, voice]);

  return (
    <aside className="com-colonne" aria-label="Communication du document">
      <VoicePanel voice={voice} online={communication.status === 'en-ligne'} userId={user.id} />
      <ChatPanel communication={communication} user={user} />
    </aside>
  );
}
