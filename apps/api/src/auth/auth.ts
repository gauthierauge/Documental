import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { haveIBeenPwned } from 'better-auth/plugins/haveibeenpwned';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { eq } from 'drizzle-orm';
import type { Deps } from '@/app';
import { dialect } from '@/db/client';
import * as schema from '@/db/schema';
import { CLIENT_IP_HEADER } from '@/http/client-ip';
import { betterAuthStorage } from '@/http/rate-limit';
import { rateLimitStore } from '@/http/rate-limit-store';
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from '@documental/contracts/password-policy';

// Connexion par e-mail et mot de passe, avec double authentification (application TOTP et codes
// de secours) : obligatoire pour les admins, proposée aux autres. Pas d'inscription libre : un
// compte existe parce qu'un admin l'a invité ; l'invité choisit son mot de passe par un lien
// reçu par e-mail. Better Auth gère sessions, hachage (scrypt) et TOTP ; on ne code jamais cela
// soi-même. Les règles sont décrites dans docs/connexion.md.

const DEV_SECRET = 'secret-de-developpement-uniquement-ne-pas-utiliser';

export const ROLES = ['admin', 'editeur', 'lecteur'] as const;
export type Role = (typeof ROLES)[number];

/** Durée de validité d'un lien de réinitialisation, et d'un lien d'invitation. */
export const RESET_LINK_HOURS = 1;
export const INVITATION_LINK_HOURS = 72;

/** Les chemins où un mot de passe est choisi : les règles s'y appliquent. */
const NEW_PASSWORD_PATHS = ['/reset-password', '/change-password'];

export function createAuth(deps: Pick<Deps, 'db' | 'env' | 'mailer'>) {
  const { db, env, mailer } = deps;
  const url = new URL(env.APP_URL);
  const appName: string = 'Documental';

  return betterAuth({
    appName,
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET ?? DEV_SECRET,
    trustedOrigins: [url.origin],
    database: drizzleAdapter(db, { provider: dialect, schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      resetPasswordTokenExpiresIn: 60 * 60 * RESET_LINK_HOURS,
      // Un mot de passe changé ferme toutes les sessions ouvertes, y compris celle d'un intrus.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url: link, token }) => {
        // Un compte sans mot de passe est un invité : même lien, autre message, plus longue durée.
        const [credential] = await db
          .select({ id: schema.account.id })
          .from(schema.account)
          .where(eq(schema.account.userId, user.id))
          .limit(1);
        if (!credential) {
          await db
            .update(schema.verification)
            .set({ expiresAt: new Date(Date.now() + INVITATION_LINK_HOURS * 3600 * 1000) })
            .where(eq(schema.verification.identifier, `reset-password:${token}`));
          await mailer.send({
            to: user.email,
            subject: `Votre accès à ${appName}`,
            text: `Bonjour,\n\nUn compte vient d'être créé pour vous. Pour choisir votre mot de passe, ouvrez ce lien (valable ${INVITATION_LINK_HOURS} heures, une seule fois) :\n\n${link}\n\nSi vous n'attendiez pas ce message, ignorez-le.`,
          });
          return;
        }
        await mailer.send({
          to: user.email,
          subject: 'Réinitialiser votre mot de passe',
          text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable ${RESET_LINK_HOURS} heure, une seule fois) :\n\n${link}\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.`,
        });
      },
    },
    session: {
      // Une journée de travail ; au-delà, on se reconnecte.
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 60,
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'lecteur', input: false },
      },
    },
    // Toujours actif, développement et tests compris : la protection se vérifie comme le reste.
    // Par adresse IP et par chemin ; l'adresse vient de TRUST_PROXY (voir `advanced.ipAddress`).
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      // Les compteurs avec ceux des autres limites : dans la base si le projet en a une.
      customStorage: betterAuthStorage(rateLimitStore(deps)),
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
      },
    },
    advanced: {
      // Cookies Secure (préfixe __Secure-) dès que le site est en https ; le serveur refuse de
      // démarrer en production si APP_URL ne l'est pas.
      useSecureCookies: url.protocol === 'https:',
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
      // L'adresse du visiteur, résolue selon TRUST_PROXY (src/server/http/client-ip.ts) : un
      // en-tête envoyé par le client ne peut pas la remplacer.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (NEW_PASSWORD_PATHS.includes(ctx.path)) {
          const body = ctx.body as { newPassword?: unknown } | undefined;
          const problem = passwordProblem(
            typeof body?.newPassword === 'string' ? body.newPassword : '',
          );
          if (problem)
            throw new APIError('BAD_REQUEST', { message: problem, code: 'MOT_DE_PASSE_REFUSE' });
        }
        // Profil : le nom doit être rempli et pas trop long.
        if (ctx.path === '/update-user') {
          const body = ctx.body as { name?: unknown } | undefined;
          if (body?.name !== undefined) {
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (name === '' || name.length > 100) {
              throw new APIError('BAD_REQUEST', {
                message: 'Le nom doit faire entre 1 et 100 caractères.',
                code: 'NOM_INVALIDE',
              });
            }
          }
        }
        if (ctx.path === '/two-factor/disable') {
          const session = await getSessionFromCtx(ctx);
          if ((session?.user as { role?: string } | undefined)?.role === 'admin') {
            throw new APIError('FORBIDDEN', {
              message: 'La double authentification est obligatoire pour les admins.',
              code: 'DEUXFA_OBLIGATOIRE',
            });
          }
        }
      }),
    },
    plugins: [
      twoFactor({
        issuer: appName,
        // Dix codes de secours, chiffrés en base ; un code ne sert qu'une fois.
        backupCodeOptions: { amount: 10, length: 10 },
        // Dix codes faux et le compte attend un quart d'heure avant un nouvel essai.
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 900 },
      }),
      // Désactivé par défaut : aucun appel réseau sans décision écrite. Voir docs/connexion.md.
      haveIBeenPwned({
        enabled: env.PASSWORD_HIBP,
        paths: NEW_PASSWORD_PATHS,
        customPasswordCompromisedMessage:
          'Ce mot de passe figure dans des fuites de données connues : choisissez-en un autre.',
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
