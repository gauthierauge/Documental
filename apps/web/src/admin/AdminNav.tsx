import { useCurrentUser } from '@/auth/client';
import { NavLink } from '@/ui/NavLink';

export function AdminNav() {
  const { user } = useCurrentUser();
  return user && user.role !== 'lecteur' ? <NavLink href="/admin">Admin</NavLink> : null;
}
