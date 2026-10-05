import { useCurrentUser } from '@/auth/client';
import { FirstAdmin } from '@/auth/FirstAdmin';
import { ButtonLink } from '@/ui/Button';
import { CheckCard } from './CheckCard';

const ROLE_LABEL = { admin: 'admin', editeur: 'éditeur', lecteur: 'lecteur' } as const;

export function AuthCheck() {
  const { user, pending } = useCurrentUser();
  const status = pending
    ? { tone: 'neutre' as const, label: 'Vérification…' }
    : user
      ? { tone: 'succes' as const, label: 'Connecté' }
      : { tone: 'neutre' as const, label: 'Non connecté' };
  return (
    <CheckCard
      title="Connexion"
      status={status}
      how={
        <>
          <FirstAdmin />
          <div className="ui-actions">
            <ButtonLink href={user ? '/compte' : '/connexion'}>
              {user ? 'Ouvrir mon compte' : 'Ouvrir l’écran de connexion'}
            </ButtonLink>
          </div>
        </>
      }
    >
      <p>
        {user
          ? `Session ouverte : ${user.email} (${ROLE_LABEL[user.role]}).`
          : 'Aucune session dans ce navigateur.'}
      </p>
    </CheckCard>
  );
}
