// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { Button, ButtonLink } from '@/ui/Button';

describe('Button', () => {
  afterEach(() => window.history.pushState(null, '', '/'));

  it("est un vrai bouton, qui n'envoie pas de formulaire par défaut", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);
    const button = screen.getByRole('button', { name: 'Enregistrer' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('ui-bouton', 'ui-bouton-secondaire');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ButtonLink navigue dans l’app sans recharger la page', () => {
    render(
      <ButtonLink href="/compte" variant="primaire">
        Mon compte
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Mon compte' });
    expect(link).toHaveClass('ui-bouton-primaire');
    fireEvent.click(link);
    expect(window.location.pathname).toBe('/compte');
  });
});
