import { minutesText, tooManyRequests } from '@/http/too-many';

describe('refus 429 du projet', () => {
  it('dit le délai en minutes, arrondi à la minute supérieure', () => {
    expect(minutesText(1)).toBe('1 minute');
    expect(minutesText(60)).toBe('1 minute');
    expect(minutesText(61)).toBe('2 minutes');
    expect(minutesText(15 * 60)).toBe('15 minutes');
  });

  it('au format { error } de l’API, avec Retry-After en secondes', async () => {
    const refused = tooManyRequests(90_500, 'Connexion : trop de tentatives');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('91');
    expect(refused.headers.get('content-type')).toContain('application/json');
    expect(await refused.json()).toEqual({
      error: 'Connexion : trop de tentatives, réessayez dans 2 minutes.',
    });
  });

  it('jamais moins d’une seconde à attendre', () => {
    expect(tooManyRequests(1).headers.get('retry-after')).toBe('1');
  });
});
