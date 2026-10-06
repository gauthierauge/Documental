import { NavLink } from './NavLink';
import type { NavItem } from './navigation';

export function NavList({ pages, onNavigate }: { pages: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="ui-nav">
      {pages.map((page) => (
        <NavLink key={page.href} href={page.href} onClick={onNavigate}>
          {page.label}
        </NavLink>
      ))}
    </ul>
  );
}
