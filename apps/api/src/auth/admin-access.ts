import { and, eq } from 'drizzle-orm';
import type { Deps } from '@/app';
import type { Db } from '@/db/client';
import { user } from '@/db/schema';
import type { Auth } from './auth';

// Ce que le panel admin demande à la méthode de connexion : comment inviter un compte, et quel
// facteur fort un admin doit avoir pour gérer les comptes et les réglages. Ici : la double
// authentification par application TOTP, activée et vérifiée. Le mot de passe seul ne suffit pas.

export const strongFactor = {
  code: 'DEUXFA_REQUISE',
  label: 'Double authentification',
  missing:
    'Activez la double authentification dans Mon compte pour gérer les comptes et les réglages',
  /** Affiché pour un compte sans facteur fort. */
  none: 'non activée',
  /** true : le facteur fort est tenu ailleurs (fournisseur d'identité), tout compte connecté l'a. */
  delegated: false,
} as const;

/** Le facteur fort de chaque compte qui en a un, tel qu'affiché dans la liste des comptes. */
export async function strongFactors(db: Db): Promise<Map<string, string>> {
  // oxlint-disable-next-line typescript/no-explicit-any -- requête commune aux deux dialectes.
  const rows: { id: string }[] = await (db as any)
    .select({ id: user.id })
    .from(user)
    .where(eq(user.twoFactorEnabled, true));
  return new Map(rows.map((r) => [r.id, 'activée']));
}

export async function hasStrongFactor(db: Db, userId: string): Promise<boolean> {
  // oxlint-disable-next-line typescript/no-explicit-any -- requête commune aux deux dialectes.
  const [row] = await (db as any)
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.twoFactorEnabled, true)))
    .limit(1);
  return Boolean(row);
}

/**
 * Invitation ou nouvel accès : un lien pour choisir un mot de passe. Un compte qui n'en a pas
 * encore reçoit le message d'invitation (valable 72 heures), les autres un lien de
 * réinitialisation (valable 1 heure). La double authentification reste exigée ensuite.
 */
export async function sendAccessLink(auth: Auth, _env: Deps['env'], email: string): Promise<void> {
  await auth.api.requestPasswordReset({ body: { email, redirectTo: '/mot-de-passe/nouveau' } });
}

/** L'invitation vue de l'admin : `{email}` est remplacé ; `resend` : bouton pour renvoyer l'accès. */
export const accessLink: { invited: string; resend: string | null } = {
  invited: 'Invitation envoyée à {email}.',
  resend: 'Renvoyer un lien',
};

/** Une adresse que la méthode de connexion refuserait d'office ; ici, aucune. */
export function invitationProblem(_env: Deps['env'], _email: string): string | null {
  return null;
}
