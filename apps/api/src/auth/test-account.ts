import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { type Db, databaseUrl, openDatabase } from '@/db/client';
import * as schema from '@/db/schema';
import { readEnv } from '@/env';
import { passwordProblem } from '@documental/contracts/password-policy';

// Le compte d'essai des tests qui passent par l'API réelle : les parcours de l'app mobile liée et
// ses tests d'intégration. Un compte « lecteur » avec un mot de passe, sans invitation par e-mail.
// Jamais en production. Usage : KIT_ESSAI_EMAIL=… KIT_ESSAI_MOT_DE_PASSE=… bun run compte:essai

export const TEST_ACCOUNT_ROLE = 'lecteur';

/** Crée le compte, ou remet son mot de passe s'il existe déjà : relancer ne crée aucun doublon. */
export async function ensureTestAccount(db: Db, email: string, password: string): Promise<string> {
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  const userId =
    existing?.id ??
    (
      await db
        .insert(schema.user)
        .values({
          email,
          name: email.split('@')[0] ?? email,
          role: TEST_ACCOUNT_ROLE,
          emailVerified: true,
        })
        .returning({ id: schema.user.id })
    )[0]?.id;
  if (!userId) throw new Error(`Compte d'essai non créé : ${email}`);
  await db
    .delete(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')));
  await db.insert(schema.account).values({
    userId,
    accountId: userId,
    providerId: 'credential',
    password: await hashPassword(password),
  });
  return userId;
}

if (import.meta.main) {
  const env = readEnv();
  const email = process.env.KIT_ESSAI_EMAIL?.trim().toLowerCase() ?? '';
  const password = process.env.KIT_ESSAI_MOT_DE_PASSE ?? '';
  const refused =
    env.NODE_ENV === 'production'
      ? 'jamais en production'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? 'KIT_ESSAI_EMAIL : une adresse e-mail'
        : passwordProblem(password);
  if (refused) {
    console.error(`Compte d'essai refusé : ${refused}`);
    process.exit(1);
  }
  const database = await openDatabase(databaseUrl(env));
  await database.migrate();
  await ensureTestAccount(database.db, email, password);
  await database.close();
  console.info(`Compte d'essai prêt : ${email}`);
}
