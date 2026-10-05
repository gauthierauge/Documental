import {
  baseHealth,
  readOnlyCheck,
  requiredVariables,
  smokeProject,
  trialPlaceholders,
  userCheck,
} from '@/scripts/docker-smoke';

const COMPOSE = `services:
  app:
    environment:
      SENTRY_DSN: \${SENTRY_DSN:-}
      AUTH_SECRET: \${AUTH_SECRET:?définir AUTH_SECRET dans .env pour l'essai local}
      MAIL_API_KEY: \${MAIL_API_KEY:?définir MAIL_API_KEY dans .env pour l'essai local}
      MAIL_FROM: \${MAIL_FROM:-Ne pas répondre <noreply@exemple.fr>}
  db:
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?définir POSTGRES_PASSWORD dans .env (make env)}
`;

describe('make smoke', () => {
  test('les variables exigées par compose.yaml, sans les facultatives', () => {
    expect(requiredVariables(COMPOSE)).toEqual([
      'AUTH_SECRET',
      'MAIL_API_KEY',
      'POSTGRES_PASSWORD',
    ]);
  });

  test('des valeurs fictives seulement pour ce qui manque ; le .env garde la main', () => {
    const known = { AUTH_SECRET: 'déjà-dans-le-env', POSTGRES_PASSWORD: '  ' };
    expect(trialPlaceholders(COMPOSE, known, () => 'fictif')).toEqual({
      MAIL_API_KEY: 'fictif',
      POSTGRES_PASSWORD: 'fictif',
    });
  });

  test('une valeur fictive par défaut : aléatoire et assez longue pour un secret', () => {
    const values = trialPlaceholders(COMPOSE, {});
    expect(Object.values(values).every((v) => v.length >= 32)).toBe(true);
    expect(new Set(Object.values(values)).size).toBe(3);
  });

  test('un projet compose à part de celui de make up', () => {
    expect(smokeProject('/Users/moi/Dev/Atelier Client')).toBe('atelier-client-smoke');
  });

  test('/api/health/base : 200 vérifié, 404 absent, le reste en échec', () => {
    expect(baseHealth(200)).toEqual({ ok: true, detail: '/api/health/base' });
    expect(baseHealth(404)).toBeNull();
    expect(baseHealth(503)?.ok).toBe(false);
    expect(baseHealth(null)?.detail).toContain('pas de réponse');
  });

  test('le processus ne tourne jamais en root', () => {
    expect(userCheck('1000\n')).toEqual({ ok: true, detail: 'utilisateur 1000 (non root)' });
    expect(userCheck('0\n').ok).toBe(false);
    expect(userCheck('Error: no such service').ok).toBe(false);
  });

  test("lecture seule : seule l'erreur EROFS le prouve", () => {
    expect(readOnlyCheck('EROFS\n').ok).toBe(true);
    expect(readOnlyCheck('ecrit\n')).toEqual({
      ok: false,
      detail: 'système de fichiers modifiable',
    });
    expect(readOnlyCheck('EACCES\n').ok).toBe(false);
  });
});
