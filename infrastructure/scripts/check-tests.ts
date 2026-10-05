import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type Policy = Readonly<{
  roots: readonly Readonly<{ code: string; tests: string }>[];
  required: readonly string[];
  exempt: readonly string[];
  probes: Readonly<{ required: string; exempt: string }>;
}>;

export type Verdict = Readonly<{
  orphans: string[];
  missing: string[];
  tests: number;
  required: number;
}>;

const TEST = /\.test\.tsx?$/;
const CODE = /\.(ts|tsx)$/;
const EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

export function globToRegExp(glob: string): RegExp {
  const pattern = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => {
      if (part === '**/') return '(?:.*/)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${pattern}$`);
}

const matchesAny = (globs: readonly string[], path: string) =>
  globs.some((g) => globToRegExp(g).test(path));

export const exportsOnlyTypes = (text: string) =>
  /^export\s/m.test(text) && !/^export\s+(?!type\b|interface\b)/m.test(text);

const under = (path: string, dir: string) => path.startsWith(`${dir}/`);

function longest<T>(items: readonly T[], key: (item: T) => string, path: string): T | null {
  return (
    [...items]
      .filter((i) => under(path, key(i)))
      .sort((a, b) => key(b).length - key(a).length)[0] ?? null
  );
}

export function judge(
  policy: Policy,
  files: readonly string[],
  read: (path: string) => string,
): Verdict {
  const all = new Set(files);
  const testDirs = policy.roots.map((r) => r.tests);
  const tests = files.filter((f) => TEST.test(f) && testDirs.some((d) => under(f, d)));
  const orphans = tests.filter((test) => {
    const root = longest(policy.roots, (r) => r.tests, test);
    if (!root) return true;
    const base = `${root.code}/${test.slice(root.tests.length + 1).replace(TEST, '')}`;
    return !EXTENSIONS.some((ext) => all.has(`${base}.${ext}`));
  });
  const required = files.filter((file) => {
    if (!CODE.test(file) || TEST.test(file) || testDirs.some((d) => under(file, d))) return false;
    if (!longest(policy.roots, (r) => r.code, file)) return false;
    if (!matchesAny(policy.required, file) || matchesAny(policy.exempt, file)) return false;
    return !exportsOnlyTypes(read(file));
  });
  const missing = required.filter((file) => {
    const root = longest(policy.roots, (r) => r.code, file);
    const base = `${root?.tests}/${file.slice((root?.code.length ?? 0) + 1).replace(CODE, '')}`;
    return !all.has(`${base}.test.ts`) && !all.has(`${base}.test.tsx`);
  });
  return { orphans, missing, tests: tests.length, required: required.length };
}

export function report(policy: Policy, verdict: Verdict): string[] {
  const lines = verdict.orphans.map((t) => `  ${t} : test orphelin, aucun fichier de code en face`);
  for (const file of verdict.missing) {
    const root = longest(policy.roots, (r) => r.code, file);
    const test = `${root?.tests}/${file.slice((root?.code.length ?? 0) + 1).replace(CODE, '.test.ts')}`;
    lines.push(`  ${file} : test exigé par la politique de tests (${test})`);
  }
  return lines;
}

export function probe(
  policy: Policy,
  files: readonly string[],
  read: (path: string) => string,
): string[] {
  const code = (path: string) =>
    path === policy.probes.required || path === policy.probes.exempt
      ? 'export const sonde = 1;\n'
      : read(path);
  const verdict = judge(
    policy,
    [
      ...files,
      policy.probes.required,
      policy.probes.exempt,
      `${policy.roots[0]?.tests}/sonde-orpheline.test.ts`,
    ],
    code,
  );
  const failures: string[] = [];
  if (!verdict.missing.includes(policy.probes.required))
    failures.push(`${policy.probes.required} sans test n'est pas refusé`);
  if (verdict.missing.includes(policy.probes.exempt))
    failures.push(`${policy.probes.exempt} sans test est refusé à tort`);
  if (!verdict.orphans.some((o) => o.endsWith('sonde-orpheline.test.ts')))
    failures.push('un test orphelin n’est pas refusé');
  return failures;
}

export function listFiles(root: string, dir: string): string[] {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir)).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? listFiles(root, path) : [path];
  });
}

function main(): number {
  const args = process.argv.slice(2);
  const policy = JSON.parse(
    readFileSync(args.find((a) => a.endsWith('.json')) ?? 'test-policy.json', 'utf8'),
  ) as Policy;
  const dirs = new Set(policy.roots.flatMap((r) => [r.code, r.tests]));
  const files = [...new Set([...dirs].flatMap((d) => listFiles('.', d)))].map((f) =>
    f.replace(/^\.\//, ''),
  );
  const read = (path: string) => readFileSync(path, 'utf8');
  if (args.includes('--sondes')) {
    const failures = probe(policy, files, read);
    if (failures.length) {
      console.error('✗ Sondes de la politique de tests');
      for (const f of failures) console.error(`  ${f}`);
      return 1;
    }
    console.info(
      '✓ Sondes de la politique de tests : un cas d’usage sans test est refusé, un DTO sans test passe, un test orphelin est refusé',
    );
    return 0;
  }
  const verdict = judge(policy, files, read);
  const lines = report(policy, verdict);
  if (lines.length) {
    console.error(`✗ Tests en miroir : ${lines.length} problème(s)`);
    for (const line of lines) console.error(line);
    return 1;
  }
  console.info(
    `✓ Tests en miroir : ${verdict.tests} tests en face de leur code ; ${verdict.required} fichiers à tester, tous testés`,
  );
  return 0;
}

if (import.meta.main) process.exit(main());
