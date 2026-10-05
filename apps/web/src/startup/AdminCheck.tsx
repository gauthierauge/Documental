import { useCurrentUser } from '@/auth/client';
import { ButtonLink } from '@/ui/Button';
import { CheckCard } from './CheckCard';

export function AdminCheck() {
  const { user, pending } = useCurrentUser();
  const allowed = user !== null && user.role !== 'lecteur';
  const status = pending
    ? { tone: 'neutre' as const, label: 'Vérification…' }
    : allowed
      ? { tone: 'succes' as const, label: 'Accessible' }
      : { tone: 'attention' as const, label: 'Connexion admin requise' };
  return (
    <CheckCard
      title="Panel admin"
      status={status}
      how={
        <div className="ui-actions">
          <ButtonLink href="/admin">Ouvrir le panel admin</ButtonLink>
        </div>
      }
    >
      <p>Contenus, comptes, réglages et journal, décrits dans admin.config.ts (voir le README).</p>
    </CheckCard>
  );
}
