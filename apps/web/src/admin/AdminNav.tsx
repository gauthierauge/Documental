import { useCurrentUser } from '@/auth/client';
import { NavLink } from '@/ui/NavLink';

/** Le lien du panel admin, pour les comptes qui y ont accès (admin et éditeur, comme l'API). */
export function AdminNav() {
  const { user } = useCurrentUser();
  return user && user.role !== 'lecteur' ? <NavLink href="/admin">Admin</NavLink> : null;
}
