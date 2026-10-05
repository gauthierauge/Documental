import { type Env, parseEnv } from '@documental/api/env';
import { productionProblems } from '@documental/api/env-production';
import type { EnvValues } from './env-file';

const LOCAL_TRIAL =
  "LOCAL_TRIAL : réservé à l'essai local de l'image (compose.yaml), jamais sur un serveur";

function withRules(env: Env): string[] {
  return [...(env.LOCAL_TRIAL ? [LOCAL_TRIAL] : []), ...productionProblems(env)];
}

function about(problem: string, names: string[]): boolean {
  return names.some((name) => problem.startsWith(`${name} `) || problem.startsWith(`${name}=`));
}

export function envProblems(values: EnvValues): string[] {
  const source = { ...values, NODE_ENV: 'production' };
  const parsed = parseEnv(source);
  if (parsed.success) return withRules(parsed.env);
  const invalid = new Set(parsed.invalid);
  const rest = parseEnv(
    Object.fromEntries(Object.entries(source).filter(([n]) => !invalid.has(n))),
  );
  if (!rest.success) return parsed.problems;
  const others = withRules(rest.env).filter((problem) => !about(problem, parsed.invalid));
  return [...parsed.problems, ...others];
}
