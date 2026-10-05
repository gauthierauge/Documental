import type { StartupState } from '@documental/contracts/startup';
import { CHECKING, CheckCard } from './CheckCard';

/** Les e-mails : affichés dans le terminal en développement, envoyés pour de vrai sinon. */
export function EmailsCheck({ state }: { state: StartupState | null }) {
  const provider = state?.emails;
  const status = !provider
    ? CHECKING
    : provider === 'console'
      ? { tone: 'neutre' as const, label: 'Dans le terminal' }
      : { tone: 'succes' as const, label: `Envoi réel (${provider})` };
  return (
    <CheckCard
      title="E-mails"
      status={status}
      how={
        <p>
          Déclencher un envoi (lien de connexion, invitation) : le message apparaît dans le terminal
          où tourne <code>bun run dev</code>.
        </p>
      }
    >
      <p>
        {provider === 'console' || !provider
          ? 'En développement, aucun e-mail ne part : chacun s’affiche dans le terminal de l’API (MAIL_PROVIDER=console).'
          : `Les e-mails partent par ${provider}, avec MAIL_API_KEY et MAIL_FROM lus dans l’environnement.`}
      </p>
    </CheckCard>
  );
}
