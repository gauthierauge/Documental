import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename } from 'node:path';
import { parseEnvText } from './env-file';

const WAIT_SECONDS = 180;

export function requiredVariables(compose: string): string[] {
  const names = [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)].map((m) => m[1] ?? '');
  return [...new Set(names)];
}

export function placeholder(): string {
  return `essai-${randomBytes(24).toString('base64url')}`;
}

export function trialPlaceholders(
  compose: string,
  known: Record<string, string | undefined>,
  make: () => string = placeholder,
): Record<string, string> {
  const missing = requiredVariables(compose).filter((name) => !known[name]?.trim());
  return Object.fromEntries(missing.map((name) => [name, make()]));
}

export function smokeProject(dir: string): string {
  const name = basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
  return `${name}-smoke`;
}

export interface Outcome {
  ok: boolean;
  detail: string;
}

export function baseHealth(status: number | null): Outcome | null {
  if (status === 200) return { ok: true, detail: '/api/health/base' };
  if (status === 404) return null;
  return { ok: false, detail: `/api/health/base : ${status ?? 'pas de réponse'}` };
}

export function userCheck(output: string): Outcome {
  const uid = Number.parseInt(output.trim().split('\n').pop() ?? '', 10);
  if (Number.isNaN(uid)) return { ok: false, detail: `utilisateur illisible (${output.trim()})` };
  if (uid === 0) return { ok: false, detail: 'le processus tourne en root' };
  return { ok: true, detail: `utilisateur ${uid} (non root)` };
}

export function readOnlyCheck(output: string): Outcome {
  const code = output.trim().split('\n').pop() ?? '';
  if (code === 'EROFS') return { ok: true, detail: 'système de fichiers en lecture seule' };
  if (code === 'ecrit') return { ok: false, detail: 'système de fichiers modifiable' };
  return {
    ok: false,
    detail: `système de fichiers : écriture refusée pour une autre raison (${code})`,
  };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, quiet = false) {
  const result = spawnSync(command, args, {
    env,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
  });
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function status(url: string): Promise<number | null> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5_000) })).status;
  } catch {
    return null;
  }
}

async function waitHealth(url: string): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    if ((await status(url)) === 200) return true;
    await Bun.sleep(1_000);
  }
  return false;
}

const WRITE_PROBE =
  "try { require('node:fs').writeFileSync('/app/.essai-ecriture', 'x'); console.log('ecrit') } catch (e) { console.log(e.code) }";

async function main(): Promise<number> {
  const started = Date.now();
  if (!existsSync('.env')) run('bun', ['infrastructure/scripts/env.ts', 'init'], process.env);
  const composeText = readFileSync('infrastructure/docker/compose.yaml', 'utf8');
  const known = { ...parseEnvText(readFileSync('.env', 'utf8')), ...process.env };
  const placeholders = trialPlaceholders(composeText, known);
  if (Object.keys(placeholders).length) {
    console.info(`Valeurs fictives pour l'essai : ${Object.keys(placeholders).join(', ')}`);
  }
  const [appPort, dbPort] = [await freePort(), await freePort()];
  const env = {
    ...process.env,
    ...placeholders,
    APP_PORT: String(appPort),
    DB_PORT: String(dbPort),
  };
  const project = smokeProject(process.cwd());
  const compose = (args: string[], quiet = false) =>
    run(
      'docker',
      [
        'compose',
        '--file',
        'infrastructure/docker/compose.yaml',
        '--env-file',
        '.env',
        '--project-name',
        project,
        ...args,
      ],
      env,
      quiet,
    );

  const checks: string[] = [];
  const fail = (detail: string) => {
    console.error(`✗ ${detail}`);
    compose(['logs', '--no-color', '--tail', '80']);
    return 1;
  };
  try {
    const up = compose([
      'up',
      '--build',
      '--detach',
      '--wait',
      '--wait-timeout',
      `${WAIT_SECONDS}`,
    ]);
    if (up.code !== 0) return fail("l'image n'a pas démarré (journaux ci-dessous)");

    const base = `http://127.0.0.1:${appPort}/api`;
    if (!(await waitHealth(`${base}/health`))) return fail('/api/health ne répond pas 200');
    checks.push('/api/health');
    const db = baseHealth(await status(`${base}/health/base`));
    if (db && !db.ok) return fail(db.detail);
    if (db) checks.push(db.detail);

    const exec = (code: string) => compose(['exec', '-T', 'app', 'bun', '-e', code], true).output;
    for (const check of [
      userCheck(exec('console.log(process.getuid())')),
      readOnlyCheck(exec(WRITE_PROBE)),
    ]) {
      if (!check.ok) return fail(check.detail);
      checks.push(check.detail);
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    console.info(`✓ Image vérifiée en ${seconds} s : ${checks.join(', ')}`);
    return 0;
  } finally {
    compose(['down', '--volumes', '--remove-orphans', '--rmi', 'local'], true);
  }
}

if (import.meta.main) process.exit(await main());
