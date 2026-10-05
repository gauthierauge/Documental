import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { PASSWORD_MAX, passwordProblem } from '@documental/contracts/password-policy';
import { tooManyMessage } from '@/too-many';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
  // Le fetch global est relu à chaque appel : les tests peuvent le remplacer.
  fetchOptions: { customFetchImpl: (input, init) => fetch(input, init) },
  plugins: [twoFactorClient()],
});

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editeur' | 'lecteur';
  twoFactorEnabled: boolean;
}

/** L'utilisateur connecté, avec son rôle. */
export function useCurrentUser(): { user: CurrentUser | null; pending: boolean } {
  const { data, isPending } = authClient.useSession();
  return { user: (data?.user as CurrentUser | undefined) ?? null, pending: isPending };
}

export { PASSWORD_MAX, passwordProblem };

/** Une erreur de Better Auth en français. Les messages restent neutres : rien sur l'existence d'un compte. */
export function errorMessage(error: {
  status: number;
  code?: string | undefined;
  message?: string | undefined;
}): string {
  if (error.code === 'MOT_DE_PASSE_REFUSE' && error.message) return error.message;
  if (error.code === 'PASSWORD_COMPROMISED')
    return 'Ce mot de passe figure dans des fuites de données connues : choisissez-en un autre.';
  if (error.code === 'INVALID_TOKEN') return 'Ce lien n’est plus valable : demandez-en un nouveau.';
  if (error.code === 'INVALID_PASSWORD') return 'Mot de passe actuel incorrect.';
  if (error.code === 'INVALID_CODE' || error.code === 'INVALID_BACKUP_CODE')
    return 'Code incorrect.';
  if (error.code === 'INVALID_TWO_FACTOR_COOKIE') return 'Délai dépassé : reconnectez-vous.';
  if (error.code === 'DEUXFA_OBLIGATOIRE' && error.message) return error.message;
  if (error.code === 'NOM_INVALIDE' && error.message) return error.message;
  // Le refus 429 dit quand réessayer, au format du projet.
  if (error.status === 429) return tooManyMessage(error, null);
  if (error.status === 401) return 'Adresse e-mail ou mot de passe incorrect.';
  return 'Action impossible pour le moment, réessayez.';
}
