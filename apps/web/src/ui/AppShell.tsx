import { type ReactNode, useState } from 'react';
import { Link } from '@/router';
import { AppearanceSwitch } from './AppearanceSwitch';
import { MenuButton } from './MenuButton';
import { NavList } from './NavList';
import type { NavItem } from './navigation';
import { PageSearch } from './PageSearch';
import { useMenu } from './useMenu';
import './shell.css';
import './app-shell.css';

export function AppShell({
  title,
  pages,
  account,
  children,
}: {
  title: string;
  pages: NavItem[];
  account?: ReactNode;
  children: ReactNode;
}) {
  const menu = useMenu();
  const [folded, setFolded] = useState(false);
  return (
    <div className="ui-coquille" data-replie={folded || undefined}>
      <a className="ui-evitement" href="#contenu">
        Aller au contenu
      </a>
      <header className="ui-cote" data-ouvert={menu.open || undefined}>
        <div className="ui-cote-tete">
          <Link href="/" className="ui-marque">
            {title}
          </Link>
          <button
            type="button"
            className="ui-menu-bouton ui-replier"
            aria-expanded={!folded}
            aria-controls="menu-principal"
            onClick={() => setFolded(!folded)}
          >
            <span className="ui-menu-icone" aria-hidden="true" />
            <span className="sr-only">Menu latéral</span>
          </button>
          <MenuButton menu={menu} controls="menu-principal" />
        </div>
        <nav id="menu-principal" className="ui-cote-menu" aria-label="Navigation principale">
          <NavList pages={pages} onNavigate={menu.close} />
        </nav>
      </header>
      <div className="ui-colonne">
        <div className="ui-barre-haut">
          <PageSearch pages={pages} />
          {account && (
            <nav aria-label="Compte">
              <ul className="ui-nav">{account}</ul>
            </nav>
          )}
        </div>
        <main id="contenu" className="ui-contenu" tabIndex={-1}>
          {children}
        </main>
        <footer className="ui-pied">
          <span>
            © {new Date().getFullYear()} {title}
          </span>
          <AppearanceSwitch />
        </footer>
      </div>
    </div>
  );
}
