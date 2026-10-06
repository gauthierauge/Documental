import type { ReactNode } from 'react';
import type { DocumentCrumb, DocumentItem, DocumentPerson } from '@documental/contracts/documents';
import { Avatars } from '@/documents/Avatars';
import { Breadcrumb, formatDate } from '@/documents/shared';
import type { EditorState } from '@/edition/Editor';
import { Button } from '@/ui/Button';

const STATE_LABEL = {
  chargement: 'Chargement…',
  enregistre: 'Enregistré',
  enregistrement: 'Enregistrement…',
  'hors-ligne': 'Hors ligne · modifications gardées',
  erreur: 'Enregistrement impossible',
} as const;

const STATE_HINT: Partial<Record<keyof typeof STATE_LABEL, string>> = {
  'hors-ligne': 'Vos modifications sont gardées et partiront au retour de la connexion.',
};

export function SaveState({ state }: { state: EditorState | null }) {
  if (!state) return null;
  return (
    <span className="doc-etats">
      <span
        className={`doc-etat doc-etat-${state.status}`}
        role="status"
        title={STATE_HINT[state.status]}
      >
        {state.message ?? STATE_LABEL[state.status]}
      </span>
      {state.status === 'erreur' && (
        <Button variant="discret" onClick={() => window.location.reload()}>
          Recharger
        </Button>
      )}
      {state.ready && !state.canEdit && (
        <span className="doc-etat doc-etat-lecture">Lecture seule</span>
      )}
    </span>
  );
}

export function DocumentBar({
  item,
  path,
  self,
  people,
  state,
  share,
  vues,
  onFollow,
}: {
  item: DocumentItem;
  path: DocumentCrumb[];
  self: DocumentPerson;
  people: DocumentPerson[];
  state: EditorState | null;
  share?: ReactNode;
  vues?: ReactNode;
  onFollow?: (person: DocumentPerson) => void;
}) {
  return (
    <header className="doc-barre">
      <div className="doc-barre-gauche">
        <Breadcrumb path={path.slice(0, -1)} />
        <div className="doc-titre-ligne">
          <h1 className="doc-titre">{item.name}</h1>
          <SaveState state={state} />
        </div>
        <p className="doc-discret">
          Modifié le {formatDate(item.updatedAt)}
          {item.updatedBy ? ` par ${item.updatedBy.name}` : ''}
          {item.createdBy ? ` · créé par ${item.createdBy.name}` : ''}
        </p>
      </div>
      <div className="doc-barre-droite">
        {vues}
        <Avatars self={self} others={people} {...(onFollow ? { onFollow } : {})} />
        {share}
      </div>
    </header>
  );
}
