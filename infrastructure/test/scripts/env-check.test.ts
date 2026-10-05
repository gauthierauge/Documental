import { readFileSync } from 'node:fs';
import { envProblems } from '@/scripts/env-check';
import { PRODUCTION_ENV } from '@documental/api/test/support/helpers';
import { parseEnvText } from '@/scripts/env-file';

describe('make env-check', () => {
  it('un fichier de production complet passe', () => {
    expect(envProblems(PRODUCTION_ENV)).toEqual([]);
  });

  it('vérifie toujours la production, quel que soit le NODE_ENV du fichier', () => {
    expect(envProblems({ ...PRODUCTION_ENV, NODE_ENV: 'development' })).toEqual([]);
  });

  it('dit tout d’un coup : valeurs invalides (en français) puis règles de production', () => {
    const problems = envProblems({ ...PRODUCTION_ENV, PORT: 'abc', LOCAL_TRIAL: 'true' });
    expect(problems[0]).toMatch(/^PORT : .*nombre/);
    expect(problems).toContain(
      "LOCAL_TRIAL : réservé à l'essai local de l'image (compose.yaml), jamais sur un serveur",
    );
  });

  it('le modèle .env.example ne contient aucun secret', () => {
    const example = parseEnvText(readFileSync('.env.example', 'utf8'));
    for (const [name, value] of Object.entries(example)) {
      if (/(SECRET|PASSWORD|_KEY|_KEY_ID)$/.test(name)) expect(`${name}=${value}`).toBe(`${name}=`);
    }
  });
});
