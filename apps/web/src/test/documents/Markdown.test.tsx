import { render, screen } from '@testing-library/react';
import { Markdown } from '@/documents/Markdown';

describe('Rendu du corps d’un document', () => {
  it('rend titres, listes, liens et code', () => {
    render(
      <Markdown
        source={'# Plan\n\n- un point\n\nVoir [la charte](/documents/d1) et `bun run dev`.'}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('un point');
    expect(screen.getByRole('link', { name: 'la charte' })).toHaveAttribute(
      'href',
      '/documents/d1',
    );
    expect(screen.getByText('bun run dev').tagName).toBe('CODE');
  });

  it('ouvre un lien externe dans un onglet, sans fuite de référent', () => {
    render(<Markdown source="[ailleurs](https://exemple.fr)" />);
    const link = screen.getByRole('link', { name: 'ailleurs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('n’ouvre pas d’onglet pour un lien interne', () => {
    render(<Markdown source="[ici](/documents/a)" />);
    expect(screen.getByRole('link', { name: 'ici' })).not.toHaveAttribute('target');
  });

  it('affiche le HTML écrit par un rédacteur comme du texte, sans l’exécuter', () => {
    const { container } = render(
      <Markdown source={'<img src=x onerror="alert(1)">\n\n<b>gras ?</b>'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.textContent).toContain('<b>gras ?</b>');
  });

  it('ne produit pas de lien pour une adresse exécutable', () => {
    const { container } = render(<Markdown source="[clique](javascript:alert(1))" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('clique');
  });

  it('rend une image de l’application en chargement différé', () => {
    render(<Markdown source="![Plan du site](/api/documents/fichiers/f1)" />);
    const image = screen.getByRole('img', { name: 'Plan du site' });
    expect(image).toHaveAttribute('src', '/api/documents/fichiers/f1');
    expect(image).toHaveAttribute('loading', 'lazy');
  });
});
