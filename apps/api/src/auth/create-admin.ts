import { eq } from 'drizzle-orm';
import { databaseUrl, openDatabase } from '@/db/client';
import * as schema from '@/db/schema';
import { readEnv } from '@/env';
import { createMailer } from '@/mail/mailer';
import { sendAccessLink } from './admin-access';
import { createAuth } from './auth';

// Crée (ou promeut) un compte admin et lui envoie le lien pour choisir son mot de passe.
// Usage : bun run admin:creer prenom@exemple.fr
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage : bun run admin:creer prenom@exemple.fr');
  process.exit(1);
}

const env = readEnv();
const url = databaseUrl(env);
if (url.startsWith('pglite://')) {
  // PGlite n'accepte qu'un processus à la fois : l'API doit être arrêtée.
  const running = await fetch(`http://localhost:${env.PORT}/api/health`).then(
    () => true,
    () => false,
  );
  if (running) {
    console.error(
      'Arrêtez d’abord l’API (bun run dev) : la base de développement ne supporte qu’un processus.',
    );
    process.exit(1);
  }
}
const database = await openDatabase(url);
await database.migrate();
const { db } = database;
const mailer = createMailer(env);

const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
if (existing) {
  await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, existing.id));
} else {
  await db.insert(schema.user).values({ email, name: email.split('@')[0] ?? email, role: 'admin' });
}

await sendAccessLink(createAuth({ db, env, mailer }), env, email);
console.info(
  `Compte admin prêt : ${email}. Le lien pour choisir le mot de passe vient d'être envoyé ; activez ensuite la double authentification dans Mon compte.`,
);
await database.close();
