import {
  devEnvText,
  missingEntries,
  parseEnvText,
  randomSecret,
  resolveDevValue,
} from '@/scripts/env-file';

const EXAMPLE = `# Connexion.
APP_URL=http://localhost:5173
# Au moins 32 caractères aléatoires en production.
AUTH_SECRET=
MAIL_FROM="Ne pas répondre <noreply@exemple.fr>"
`;

describe('fichiers d’environnement', () => {
  test('lit les valeurs, sans commentaires ni guillemets', () => {
    expect(parseEnvText(`${EXAMPLE}export PORT=8787 # le port\nPAS UNE LIGNE\n`)).toEqual({
      APP_URL: 'http://localhost:5173',
      AUTH_SECRET: '',
      MAIL_FROM: 'Ne pas répondre <noreply@exemple.fr>',
      PORT: '8787',
    });
  });

  test('un secret généré : la longueur demandée, lettres et chiffres, jamais deux fois le même', () => {
    const secrets = new Set(Array.from({ length: 50 }, () => randomSecret(48)));
    expect(secrets.size).toBe(50);
    for (const secret of secrets) expect(secret).toMatch(/^[A-Za-z0-9]{48}$/);
    expect(resolveDevValue('{{secret:32}}')).toHaveLength(32);
    expect(resolveDevValue('console')).toBe('console');
  });

  test('le .env de développement garde les commentaires et remplit les secrets', () => {
    const env = devEnvText(EXAMPLE, { AUTH_SECRET: '{{secret:48}}' });
    expect(env).toContain('# Au moins 32 caractères aléatoires en production.');
    expect(env).toContain('APP_URL=http://localhost:5173');
    expect(parseEnvText(env).AUTH_SECRET).toMatch(/^[A-Za-z0-9]{48}$/);
    expect(
      parseEnvText(devEnvText(EXAMPLE, { AUTH_SECRET: '{{secret:48}}' })).AUTH_SECRET,
    ).not.toBe(parseEnvText(env).AUTH_SECRET);
  });

  test('un .env existant est complété, jamais remplacé', () => {
    const current = 'APP_URL=http://localhost:3000\n';
    const added = missingEntries(current, EXAMPLE, { AUTH_SECRET: '{{secret:32}}' });
    expect(added.map((line) => line.split('=')[0])).toEqual(['AUTH_SECRET', 'MAIL_FROM']);
    expect(missingEntries(`${current}AUTH_SECRET=x\nMAIL_FROM=y\n`, EXAMPLE, {})).toEqual([]);
  });
});
