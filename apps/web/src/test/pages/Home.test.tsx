// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Home } from '@/pages/Home';

describe("Page d'accueil (production)", () => {
  it("affiche le nom de l'app, sans rien d'interne", () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Documental');
    expect(screen.queryByText(/Démarrage|développement/)).toBeNull();
  });
});
