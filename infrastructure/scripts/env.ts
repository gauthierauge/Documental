// `make env` (bun scripts/env.ts init) : crée le .env de développement à partir de .env.example,
// ou lui ajoute les variables apparues depuis. Rien n'est jamais remplacé.
// `make env-check` (bun scripts/env.ts check [fichier]) : vérifie un fichier d'environnement de
// production avec les règles du projet (scripts/env-check.ts). Tous les problèmes d'un coup.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { devEnvText, missingEntries, parseEnvText } from './env-file';
import { envProblems } from './env-check';

/** Les valeurs de développement qui ne peuvent pas vivre dans .env.example : secrets générés. */
const DEV_VALUES: Record<string, string> = {
  AUTH_SECRET: '{{secret:48}}',
  POSTGRES_PASSWORD: '{{secret:32}}',
};

function init(): number {
  const example = readFileSync('.env.example', 'utf8');
  if (!existsSync('.env')) {
    writeFileSync('.env', devEnvText(example, DEV_VALUES));
    console.info('.env créé : valeurs de développement, secrets tirés au hasard.');
    return 0;
  }
  const current = readFileSync('.env', 'utf8');
  const added = missingEntries(current, example, DEV_VALUES);
  if (added.length === 0) {
    console.info('.env est à jour : rien à ajouter.');
    return 0;
  }
  const block = `\n# Ajouté par make env : variables apparues dans .env.example.\n${added.join('\n')}\n`;
  writeFileSync('.env', current.replace(/\n*$/, '\n') + block);
  console.info(`.env complété : ${added.map((line) => line.split('=')[0]).join(', ')}.`);
  return 0;
}

function check(file: string): number {
  if (!existsSync(file)) {
    console.error(`${file} introuvable. Usage : make env-check FICHIER=.env.production`);
    return 2;
  }
  const problems = envProblems(parseEnvText(readFileSync(file, 'utf8')));
  if (problems.length === 0) {
    console.info(`✓ ${file} : prêt pour la production.`);
    return 0;
  }
  const count = problems.length > 1 ? `${problems.length} problèmes` : '1 problème';
  console.error(`✗ ${file} : ${count} à corriger avant la production`);
  for (const problem of problems) console.error(`  - ${problem}`);
  return 1;
}

const [command, file = '.env'] = process.argv.slice(2);
process.exit(command === 'check' ? check(file) : init());
