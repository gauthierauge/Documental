// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AppShell } from '@/ui/AppShell';
import { NavLink } from '@/ui/NavLink';

const PAGES = [
  { href: '/', label: 'Accueil' },
  { href: '/factures', label: 'Factures' },
];

function renderShell() {
  return render(
    <AppShell title="Mon app" pages={PAGES} account={<NavLink href="/compte">Mon compte</NavLink>}>
      <p>Contenu</p>
    </AppShell>,
  );
}

describe('Coquille : barre latérale + barre du haut', () => {
  afterEach(() => window.history.pushState(null, '', '/'));

  it('a ses repères, la recherche et le compte en haut, la page ouverte marquée', () => {
    window.history.pushState(null, '', '/factures');
    renderShell();
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute(
      'href',
      '#contenu',
    );
    expect(screen.getByRole('banner')).toHaveTextContent('Mon app');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenu');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Mon app');
    expect(screen.getByRole('searchbox', { name: 'Rechercher une page' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: 'Factures' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const account = screen.getByRole('navigation', { name: 'Compte' });
    expect(within(account).getByRole('link', { name: 'Mon compte' })).toBeInTheDocument();
  });

  it('se replie et se déplie, l’état annoncé par son bouton', () => {
    const { container } = renderShell();
    const fold = screen.getByRole('button', { name: 'Menu latéral' });
    fireEvent.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(container.firstChild).toHaveAttribute('data-replie');
  });

  it('sur téléphone, le bouton Menu ouvre les pages, Échap les referme', () => {
    renderShell();
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);
    expect(screen.getByRole('banner')).toHaveAttribute('data-ouvert');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('banner')).not.toHaveAttribute('data-ouvert');
    expect(button).toHaveFocus();
  });
});
