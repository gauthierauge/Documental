import { z } from 'zod';

const httpSchema = {
  BODY_MAX_KB: z.coerce.number().int().positive().max(10_240).default(100),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_S: z.coerce.number().int().positive().max(3600).default(60),
  TRUST_PROXY: z.enum(['aucun', 'cloudflare', 'x-forwarded-for']).default('aucun'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().max(100).default(30),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(15_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(0).max(60_000).default(7_000),
};

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  ...httpSchema,
  SECURITY_CONTACT: z
    .union([
      z.email().transform((email) => `mailto:${email}`),
      z.url({ protocol: /^(https|mailto)$/ }),
    ])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  LOCAL_TRIAL: z.stringbool().default(false),
  DATABASE_URL: z
    .string()
    .regex(/^(postgres(ql)?|pglite):\/\//, 'URL postgres:// ou pglite://')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  MAIL_PROVIDER: z.enum(['console', 'brevo', 'resend']).default('console'),
  MAIL_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Ne pas répondre <noreply@exemple.fr>'),
  APP_URL: z.url().default('http://localhost:5173'),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET : au moins 32 caractères')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  PASSWORD_HIBP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof schema>;

export type EnvResult =
  | { success: true; env: Env }
  | { success: false; problems: string[]; invalid: string[] };

export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const parsed = schema.safeParse(source, { error: z.locales.fr().localeError });
  if (parsed.success) return { success: true, env: parsed.data };
  const issues = parsed.error.issues.map((issue) => {
    const name = issue.path.join('.');
    return {
      name,
      message: issue.message.startsWith(name) ? issue.message : `${name} : ${issue.message}`,
    };
  });
  return {
    success: false,
    problems: issues.map((issue) => issue.message),
    invalid: issues.map((issue) => issue.name),
  };
}

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = parseEnv(source);
  if (!parsed.success) {
    throw new Error(`Variables d'environnement invalides : ${parsed.problems.join(' · ')}`);
  }
  return parsed.env;
}
