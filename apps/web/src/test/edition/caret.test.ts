import { colorFor } from '@/edition/caret';

describe('Couleur d’une personne', () => {
  it('donne toujours la même couleur à la même personne', () => {
    expect(colorFor('u1')).toBe(colorFor('u1'));
    expect(colorFor('u1')).toMatch(/^hsl\(\d+ 70% 38%\)$/);
  });

  it('varie d’une personne à l’autre', () => {
    const colors = new Set(['u1', 'u2', 'u3', 'u4', 'u5'].map(colorFor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
