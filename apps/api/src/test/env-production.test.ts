import { PRODUCTION_ENV } from './support/helpers';
import { readEnv } from '@/env';
import { assertProduction, productionProblems } from '@/env-production';

/** Des valeurs de développement ou incomplètes, chacune refusée en production. */
const REFUSED: [name: string, value: string][] = [
  ['DATABASE_URL', ''],
  ['MAIL_PROVIDER', 'console'],
  ['MAIL_API_KEY', ''],
  ['MAIL_FROM', 'Ne pas répondre <noreply@exemple.fr>'],
  ['AUTH_SECRET', ''],
  ['APP_URL', 'http://localhost:5173'],
];

describe('règles de production', () => {
  it('une configuration de production complète passe', () => {
    expect(productionProblems(readEnv(PRODUCTION_ENV))).toEqual([]);
    expect(() => assertProduction(readEnv(PRODUCTION_ENV))).not.toThrow();
  });

  for (const [name, value] of REFUSED) {
    it(`refuse ${name}=${value}`, () => {
      const problems = productionProblems(readEnv({ ...PRODUCTION_ENV, [name]: value }));
      expect(problems.some((problem) => problem.startsWith(name))).toBe(true);
    });
  }
});
