import { useCurrentUser } from '@/auth/client';
import { NavLink } from '@/ui/NavLink';

export function AdminNav() {
  const { user } = useCurrentUser();
  return user?.role === 'admin' ? <NavLink href="/admin">Admin</NavLink> : null;
}
