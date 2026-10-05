import { NavLink } from '@/ui/NavLink';
import { useCurrentUser } from './client';

export function AccountNav() {
  const { user } = useCurrentUser();
  return user ? (
    <NavLink href="/compte">Mon compte</NavLink>
  ) : (
    <NavLink href="/connexion">Connexion</NavLink>
  );
}
