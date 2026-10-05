import { ProductionRules } from './env-rules';
import type { Env } from './env';

export function productionProblems(env: Env): string[] {
  const rules = new ProductionRules({ localTrial: env.LOCAL_TRIAL });
  rules.expect(
    env.DATABASE_URL?.startsWith('postgres') === true,
    'DATABASE_URL : adresse postgres:// obligatoire en production (PGlite seulement en développement)',
  );
  rules.realProvider('MAIL_PROVIDER', env.MAIL_PROVIDER);
  rules.forRealProvider(env.MAIL_PROVIDER, (r) => r.required('MAIL_API_KEY', env.MAIL_API_KEY));
  rules.clientEmail('MAIL_FROM', env.MAIL_FROM);
  rules.secret('AUTH_SECRET', env.AUTH_SECRET);
  rules.publicUrl('APP_URL', env.APP_URL);
  return rules.problems;
}

export function assertProduction(env: Env): void {
  const problems = productionProblems(env);
  if (problems.length > 0) {
    throw new Error(`Configuration de production à corriger :\n- ${problems.join('\n- ')}`);
  }
}
