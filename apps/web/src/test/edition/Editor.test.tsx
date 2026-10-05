import { presentPeople } from '@/edition/Editor';

describe('Personnes présentes', () => {
  it('liste les autres une seule fois chacun, sans moi', () => {
    const cursor = (key: string, id: string, name: string) => ({
      key,
      user: { id, name },
      start: 0,
      end: 0,
    });
    expect(
      presentPeople(
        [
          cursor('a', 'u2', 'Zoé'),
          cursor('b', 'u3', 'Bob'),
          cursor('c', 'u2', 'Zoé'),
          cursor('d', 'u1', 'Moi'),
        ],
        'u1',
      ),
    ).toEqual([
      { id: 'u3', name: 'Bob' },
      { id: 'u2', name: 'Zoé' },
    ]);
  });
});
