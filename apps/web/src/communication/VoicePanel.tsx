import type { ReactNode } from 'react';
import type { useVoiceRoom } from '@/communication/useVoiceRoom';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Notice';

type IconName = 'casque' | 'micro' | 'micro-coupe' | 'son' | 'son-coupe' | 'sortie';

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    casque: (
      <>
        <path d="M4 13v-2a8 8 0 0 1 16 0v2" />
        <path d="M4 13a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3Zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3Z" />
      </>
    ),
    micro: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </>
    ),
    'micro-coupe': (
      <path d="M9 8V6a3 3 0 0 1 5.8-1M15 10v1a3 3 0 0 1-.4 1.5M5 11a7 7 0 0 0 11.8 5.1M19 11a7 7 0 0 1-.4 2.3M12 18v3M9 21h6M3 3l18 18" />
    ),
    son: (
      <>
        <path d="M5 9v6h4l5 4V5L9 9H5Z" />
        <path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
      </>
    ),
    'son-coupe': <path d="M5 9v6h4l5 4V5L9 9H5ZM18 10l4 4m0-4-4 4" />,
    sortie: <path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9" />,
  };
  return (
    <svg className="com-icone" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('fr-FR') ?? '')
    .join('');
}

export function VoicePanel({
  voice,
  online,
  userId,
}: {
  voice: ReturnType<typeof useVoiceRoom>;
  online: boolean;
  userId: string;
}) {
  const joined = voice.status === 'dans-vocal';
  const title = (
    <span className="com-vocal-titre">
      <Icon name="casque" />
      Vocal
    </span>
  );
  const actions = joined ? (
    <Badge tone="succes">Dans le vocal</Badge>
  ) : (
    <Button
      variant="primaire"
      disabled={!online || voice.status === 'connexion'}
      onClick={() => void voice.join()}
    >
      <Icon name="casque" />
      {voice.status === 'connexion' ? 'Connexion…' : 'Rejoindre'}
    </Button>
  );

  return (
    <Card
      title={title}
      className={joined ? 'com-vocal com-vocal-connecte' : 'com-vocal'}
      actions={actions}
    >
      {joined && (
        <p className="com-vocal-statut" role="status">
          Vous êtes connecté au vocal.
        </p>
      )}
      {voice.participants.length === 0 ? (
        <span className="com-aide">Personne dans le vocal.</span>
      ) : (
        <div className="com-vocal-participants">
          <span className="com-section-label">Participants · {voice.participants.length}</span>
          <ul className="com-vocal-liste">
            {voice.participants.map((person) => (
              <li key={person.id} data-moi={person.id === userId || undefined}>
                <span className="com-avatar" aria-hidden="true">
                  {initials(person.name)}
                </span>
                <span className="com-vocal-nom">
                  <strong>{person.name}</strong>
                  {person.id === userId && <small>Vous</small>}
                </span>
                <Badge tone={person.muted ? 'neutre' : 'succes'}>
                  <Icon name={person.muted ? 'micro-coupe' : 'micro'} />
                  {person.muted ? 'Micro coupé' : 'Micro actif'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      {joined && (
        <div className="com-vocal-controles">
          <Button onClick={voice.toggleMute}>
            <Icon name={voice.muted ? 'micro-coupe' : 'micro'} />
            {voice.muted ? 'Réactiver le micro' : 'Couper le micro'}
          </Button>
          <Button onClick={voice.toggleDeafen}>
            <Icon name={voice.deafened ? 'son-coupe' : 'son'} />
            {voice.deafened ? 'Réactiver le son' : 'Couper le son'}
          </Button>
          <Button variant="danger" onClick={() => voice.leave()}>
            <Icon name="sortie" />
            Quitter le vocal
          </Button>
        </div>
      )}
      {voice.error && <Notice tone="danger">{voice.error}</Notice>}
    </Card>
  );
}
