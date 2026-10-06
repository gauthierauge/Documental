import type { DocumentPerson } from '@documental/contracts/documents';
import { colorFor } from '@/edition/caret';

const VISIBLE = 4;

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = [...(words[0] ?? '?')][0] ?? '?';
  const last = words.length > 1 ? ([...(words.at(-1) ?? '')][0] ?? '') : '';
  return (first + last).toLocaleUpperCase('fr');
}

export function Avatar({ person, self = false }: { person: DocumentPerson; self?: boolean }) {
  const label = self ? `${person.name} (vous)` : person.name;
  return (
    <span
      className={self ? 'doc-avatar doc-avatar-moi' : 'doc-avatar'}
      style={{ backgroundColor: colorFor(person.id) }}
      title={label}
    >
      <span aria-hidden="true">{initials(person.name)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Avatars({
  self,
  others,
  onFollow,
}: {
  self: DocumentPerson;
  others: DocumentPerson[];
  onFollow?: (person: DocumentPerson) => void;
}) {
  const shown = others.slice(0, VISIBLE);
  const hidden = others.slice(VISIBLE);
  return (
    <ul className="doc-avatars" aria-label="Personnes sur le document">
      <li>
        <Avatar person={self} self />
      </li>
      {shown.map((person) => (
        <li key={person.id}>
          {onFollow ? (
            <button
              type="button"
              className="doc-avatar-bouton"
              aria-label={`Aller au curseur de ${person.name}`}
              onClick={() => onFollow(person)}
            >
              <Avatar person={person} />
            </button>
          ) : (
            <Avatar person={person} />
          )}
        </li>
      ))}
      {hidden.length > 0 && (
        <li>
          <span className="doc-avatar doc-avatar-plus" title={hidden.map((p) => p.name).join(', ')}>
            <span aria-hidden="true">+{hidden.length}</span>
            <span className="sr-only">
              et {hidden.length} autre{hidden.length > 1 ? 's' : ''} :{' '}
              {hidden.map((p) => p.name).join(', ')}
            </span>
          </span>
        </li>
      )}
    </ul>
  );
}
