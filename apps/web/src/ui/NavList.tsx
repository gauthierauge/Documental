import { NavLink } from './NavLink';
import type { NavItem } from './navigation';

/** Des pages dans une liste de liens ; `onNavigate` suit chaque clic (fermer un menu…). */
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
