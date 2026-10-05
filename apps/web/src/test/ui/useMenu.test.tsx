// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { navigate } from '@/router';
import { MenuButton } from '@/ui/MenuButton';
import { NavList } from '@/ui/NavList';
import { useMenu } from '@/ui/useMenu';

function Harness() {
  const menu = useMenu();
  return (
    <>
      <MenuButton menu={menu} controls="liens" />
      <nav id="liens" hidden={!menu.open}>
        <NavList pages={[{ href: '/', label: 'Accueil' }]} onNavigate={menu.close} />
      </nav>
    </>
  );
}

describe('Menu sur téléphone', () => {
  afterEach(() => window.history.pushState(null, '', '/'));

  it('s’ouvre et se ferme avec son bouton, qui annonce son état', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'liens');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('Échap le ferme et rend le focus au bouton', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('se ferme en suivant le lien de la page ouverte, ou en changeant de page', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('link', { name: 'Accueil', hidden: true }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    act(() => navigate('/ailleurs'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
