import { createApp, type Deps } from '@/app';
import { readEnv } from '@/env';
import type { LogWriter } from '@/http/request-log';
import { testDatabase } from './database';
import { MemoryMailer } from '@/mail/mailer';

export interface TestAppOptions {
  env?: Record<string, string>;
  log?: LogWriter;
}

export async function testApp(options: TestAppOptions = {}) {
  const env = readEnv({ NODE_ENV: 'test', ...options.env });
  const database = await testDatabase();
  const mailer = new MemoryMailer();
  const deps = {
    env,
    db: database.db,
    mailer,
    listen: database.listen,
    ...(options.log && { log: options.log }),
  } satisfies Deps;
  return { app: createApp(deps), deps };
}

export const PRODUCTION_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://app@base.atelier.test:5432/app',
  MAIL_PROVIDER: 'brevo',
  MAIL_API_KEY: 'cle-essai',
  MAIL_FROM: 'Atelier <bonjour@atelier.test>',
  APP_URL: 'https://app.atelier.test',
  AUTH_SECRET: 'z'.repeat(48),
};
