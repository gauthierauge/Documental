import { fireEvent, render, screen, within } from '@testing-library/react';
import { findPages, PageSearch } from '@/ui/PageSearch';

const PAGES = [
  { href: '/', label: 'Accueil' },
  { href: '/factures', label: 'Factures émises' },
  { href: '/devis', label: 'Devis' },
];

describe('Recherche de page', () => {
  afterEach(() => window.history.pushState(null, '', '/'));

  it('trouve chaque mot tapé, sans accents ni majuscules', () => {
    expect(findPages(PAGES, 'EMISES fact').map((p) => p.href)).toEqual(['/factures']);
    expect(findPages(PAGES, '   ')).toEqual([]);
    expect(findPages(PAGES, 'commandes')).toEqual([]);
  });

  it('affiche les résultats, annonce leur nombre et ouvre le premier avec Entrée', () => {
    render(<PageSearch pages={PAGES} />);
    const input = screen.getByRole('searchbox', { name: 'Rechercher une page' });
    fireEvent.change(input, { target: { value: 'dev' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 page trouvée');
    const results = input.closest('search') as HTMLElement;
    expect(within(results).getByRole('link', { name: 'Devis' })).toHaveAttribute('href', '/devis');
    fireEvent.submit(input);
    expect(window.location.pathname).toBe('/devis');
    expect(input).toHaveValue('');
  });

  it('dit quand rien ne correspond, et Échap vide le champ', () => {
    render(<PageSearch pages={PAGES} />);
    const input = screen.getByRole('searchbox', { name: 'Rechercher une page' });
    fireEvent.change(input, { target: { value: 'commandes' } });
    expect(screen.getByText('Aucune page ne porte ce nom.')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });
});
