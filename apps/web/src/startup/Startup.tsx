import { Page } from '@/ui/Page';
import { HealthCheck } from './HealthCheck';
import { useStartupState } from './state';
import './startup.css';
import { EmailsCheck } from './EmailsCheck';
import { AuthCheck } from './AuthCheck';
import { AdminCheck } from './AdminCheck';
import { DockerCheck } from './DockerCheck';

// La page « Démarrage » : ce que contient ce projet, l'état réel de chaque élément et le geste
// qui le vérifie. En développement seulement : en production, l'accueil (pages/Home.tsx) la
// remplace et ce code n'est même pas dans le bundle.

export function Startup() {
  const state = useStartupState();
  return (
    <Page
      title="Démarrage"
      lede="Les éléments installés dans ce projet, leur état réel et comment vérifier chacun. Cette page n’existe qu’en développement."
    >
      <div className="demarrage-grille">
        <HealthCheck title="API" path="/health">
          <p>Hono sur le port 8787, derrière Vite en développement.</p>
        </HealthCheck>
        <HealthCheck title="Base de données" path="/health/base">
          <p>
            PostgreSQL (PGlite dans data/pglite en développement, rien à installer). Une requête
            réelle à chaque ouverture de la page.
          </p>
        </HealthCheck>
        <EmailsCheck state={state} />
        <AuthCheck />
        <AdminCheck />
        <DockerCheck />
      </div>
      {state?.environnement && (
        <p className="demarrage-pied">
          Environnement de l’API : <code>{state.environnement}</code>
        </p>
      )}
    </Page>
  );
}
