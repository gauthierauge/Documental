import { render, screen } from '@testing-library/react';
import { NavList } from '@/ui/NavList';

describe('Liste des pages', () => {
  afterEach(() => window.history.pushState(null, '', '/'));

  it('un lien par page, la page ouverte marquée par aria-current', () => {
    window.history.pushState(null, '', '/factures/2026');
    render(
      <NavList
        pages={[
          { href: '/', label: 'Accueil' },
          { href: '/factures', label: 'Factures' },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Factures' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current');
  });
});
