// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { Avatars, initials } from '@/documents/Avatars';

const me = { id: 'u1', name: 'Éa Martin' };
const people = ['Bob', 'Chloé', 'Dan', 'Eve', 'Fred', 'Gus'].map((name, i) => ({
  id: `p${i}`,
  name,
}));

describe('Avatars', () => {
  it('prend les initiales du prénom et du nom', () => {
    expect(initials('Éa Martin')).toBe('ÉM');
    expect(initials('bob')).toBe('B');
    expect(initials('  ')).toBe('?');
  });

  it('montre moi d’abord, quatre personnes, puis le nombre des autres', () => {
    render(<Avatars self={me} others={people} />);
    const list = screen.getByRole('list', { name: 'Personnes sur le document' });
    expect(list.querySelectorAll('li')).toHaveLength(6);
    expect(screen.getByText('Éa Martin (vous)')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText(/et 2 autres : Fred, Gus/)).toBeInTheDocument();
  });

  it('va au curseur d’une personne au clic', () => {
    const onFollow = vi.fn();
    render(<Avatars self={me} others={people.slice(0, 1)} onFollow={onFollow} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aller au curseur de Bob' }));
    expect(onFollow).toHaveBeenCalledWith({ id: 'p0', name: 'Bob' });
  });
});
