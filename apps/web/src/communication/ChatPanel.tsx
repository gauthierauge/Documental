import { type FormEvent, useEffect, useRef, useState } from 'react';
import { CHAT_MESSAGE_MAX } from '@documental/contracts/communication';
import type { DocumentPerson } from '@documental/contracts/documents';
import type { useCommunication } from '@/communication/useCommunication';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Field, Textarea } from '@/ui/Field';
import { Notice } from '@/ui/Notice';

function time(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function Participants({ participants }: { participants: DocumentPerson[] }) {
  return (
    <div className="com-participants" aria-label="Participants en ligne">
      <span className="com-section-label">En ligne · {participants.length}</span>
      <span className="com-aide">
        {participants.map((person) => person.name).join(', ') || 'Aucun participant.'}
      </span>
    </div>
  );
}

export function ChatPanel({
  communication,
  user,
}: {
  communication: ReturnType<typeof useCommunication>;
  user: DocumentPerson;
}) {
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [communication.messages.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (communication.send({ type: 'message', id: crypto.randomUUID(), text })) setDraft('');
  }

  const status = {
    connexion: { text: 'Connexion…', tone: 'attention' as const },
    'en-ligne': { text: 'En ligne', tone: 'succes' as const },
    'hors-ligne': { text: 'Hors ligne', tone: 'danger' as const },
  }[communication.status];

  return (
    <Card
      title="Messages"
      className="com-chat"
      actions={<Badge tone={status.tone}>{status.text}</Badge>}
    >
      <Participants participants={communication.participants} />
      {communication.error && <Notice tone="danger">{communication.error}</Notice>}

      {communication.messages.length === 0 ? (
        <EmptyState title="Aucun message.">Commencez la discussion sur ce document.</EmptyState>
      ) : (
        <ol className="com-messages" ref={list} aria-label="Messages de la discussion">
          {communication.messages.map((message) => (
            <li
              key={message.id}
              className={
                message.author.id === user.id ? 'com-message com-message-moi' : 'com-message'
              }
            >
              <div className="com-message-meta">
                <strong>{message.author.id === user.id ? 'Vous' : message.author.name}</strong>
                <time dateTime={message.sentAt}>{time(message.sentAt)}</time>
              </div>
              <p>{message.text}</p>
            </li>
          ))}
        </ol>
      )}

      <form className="com-formulaire" onSubmit={submit}>
        <Field label="Message">
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              maxLength={CHAT_MESSAGE_MAX}
              value={draft}
              disabled={communication.status !== 'en-ligne'}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          )}
        </Field>
        <Button variant="primaire" type="submit" disabled={!draft.trim()}>
          Envoyer
        </Button>
      </form>
    </Card>
  );
}
