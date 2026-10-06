import { ProductionRules } from './env-rules';
import type { Env } from './env';

// Les règles de production, en plus du schéma de ./env.ts : ce que le développement accepte mais
// qui ne doit jamais partir en production. Appliquées au démarrage en production (./index.ts) et
// par `make env-check` avant un déploiement. Chaque module du Kit y ajoute les siennes.
export function productionProblems(env: Env): string[] {
  const rules = new ProductionRules({ localTrial: env.LOCAL_TRIAL });
  // Base : un vrai PostgreSQL. PGlite ne sert qu'en développement et dans les tests.
  rules.expect(
    env.DATABASE_URL?.startsWith('postgres') === true,
    'DATABASE_URL : adresse postgres:// obligatoire en production (PGlite seulement en développement)',
  );
  // E-mails : un vrai fournisseur, sa clé, une adresse d'expédition du domaine du client.
  rules.realProvider('MAIL_PROVIDER', env.MAIL_PROVIDER);
  rules.forRealProvider(env.MAIL_PROVIDER, (r) => r.required('MAIL_API_KEY', env.MAIL_API_KEY));
  rules.clientEmail('MAIL_FROM', env.MAIL_FROM);
  // Connexion : un secret fort, et l'adresse publique du site (passkeys, liens, retours OAuth).
  rules.secret('AUTH_SECRET', env.AUTH_SECRET);
  rules.publicUrl('APP_URL', env.APP_URL);
  if (env.WEBRTC_TURN_URL) {
    rules.required('WEBRTC_TURN_USERNAME', env.WEBRTC_TURN_USERNAME);
    rules.required('WEBRTC_TURN_CREDENTIAL', env.WEBRTC_TURN_CREDENTIAL);
  }
  return rules.problems;
}

/** Au démarrage en production : refuse de servir avec une configuration à corriger. */
export function assertProduction(env: Env): void {
  const problems = productionProblems(env);
  if (problems.length > 0) {
    throw new Error(`Configuration de production à corriger :\n- ${problems.join('\n- ')}`);
  }
}
