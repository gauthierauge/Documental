import { tooManyMessage } from '@/too-many';

describe('message d’un refus 429', () => {
  it('lit le message { error } de l’API', () => {
    expect(
      tooManyMessage({ error: 'Connexion : trop de tentatives, réessayez dans 2 minutes.' }, '91'),
    ).toBe('Connexion : trop de tentatives, réessayez dans 2 minutes.');
  });

  it('sans message, dit le délai de Retry-After en minutes', () => {
    expect(tooManyMessage({}, '30')).toBe('Trop de requêtes, réessayez dans 1 minute.');
    expect(tooManyMessage(null, '600')).toBe('Trop de requêtes, réessayez dans 10 minutes.');
  });

  it('sans rien de lisible, reste vague plutôt que d’inventer un délai', () => {
    expect(tooManyMessage(null, null)).toBe('Trop de requêtes, réessayez dans quelques minutes.');
  });
});
