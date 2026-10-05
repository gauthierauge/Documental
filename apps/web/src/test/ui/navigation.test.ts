import { isCurrent } from '@/ui/navigation';

describe('Page ouverte', () => {
  it('l’accueil seulement sur /', () => {
    expect(isCurrent('/', '/')).toBe(true);
    expect(isCurrent('/', '/compte')).toBe(false);
  });

  it('une section aussi sur ses sous-pages, pas sur un préfixe voisin', () => {
    expect(isCurrent('/compte', '/compte')).toBe(true);
    expect(isCurrent('/compte', '/compte/securite')).toBe(true);
    expect(isCurrent('/compte', '/comptes')).toBe(false);
  });
});
