import type { ReactNode } from 'react';
import { Link, usePath } from '@/router';
import { isCurrent } from './navigation';
import './ui.css';

/** Un lien de navigation, dans une liste : `aria-current` signale la page ouverte. */
export function NavLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: (() => void) | undefined;
  children: ReactNode;
}) {
  const path = usePath();
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="ui-nav-lien"
        aria-current={isCurrent(href, path) ? 'page' : undefined}
      >
        {children}
      </Link>
    </li>
  );
}
