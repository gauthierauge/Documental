import { and, eq } from 'drizzle-orm';
import type { Deps } from '@/app';
import type { Db } from '@/db/client';
import { user } from '@/db/schema';
import type { Auth } from './auth';

export const strongFactor = {
  code: 'DEUXFA_REQUISE',
  label: 'Double authentification',
  missing:
    'Activez la double authentification dans Mon compte pour gérer les comptes et les réglages',
  none: 'non activée',
  delegated: false,
} as const;

export async function strongFactors(db: Db): Promise<Map<string, string>> {
  const rows: { id: string }[] = await (db as any)
    .select({ id: user.id })
    .from(user)
    .where(eq(user.twoFactorEnabled, true));
  return new Map(rows.map((r) => [r.id, 'activée']));
}

export async function hasStrongFactor(db: Db, userId: string): Promise<boolean> {
  const [row] = await (db as any)
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.twoFactorEnabled, true)))
    .limit(1);
  return Boolean(row);
}

export async function sendAccessLink(auth: Auth, _env: Deps['env'], email: string): Promise<void> {
  await auth.api.requestPasswordReset({ body: { email, redirectTo: '/mot-de-passe/nouveau' } });
}

export const accessLink: { invited: string; resend: string | null } = {
  invited: 'Invitation envoyée à {email}.',
  resend: 'Renvoyer un lien',
};

export function invitationProblem(_env: Deps['env'], _email: string): string | null {
  return null;
}
