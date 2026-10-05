import { NavLink } from '@/ui/NavLink';
import { useCurrentUser } from './client';

/** « Connexion » pour un visiteur, « Mon compte » une fois connecté. */
export function AccountNav() {
  const { user } = useCurrentUser();
  return user ? (
    <NavLink href="/compte">Mon compte</NavLink>
  ) : (
    <NavLink href="/connexion">Connexion</NavLink>
  );
}
