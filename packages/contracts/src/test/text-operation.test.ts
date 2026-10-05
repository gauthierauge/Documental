import {
  apply,
  baseLength,
  compose,
  diff,
  isNoop,
  isValidOperation,
  isWellFormed,
  OperationError,
  type TextOperation,
  targetLength,
  transform,
  transformIndex,
} from '@documental/contracts/text-operation';

function random(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % max;
  };
}

const ALPHABET = [...'abcdé xyz\n😀'];

function randomText(next: (max: number) => number, length: number): string {
  return Array.from({ length }, () => ALPHABET[next(ALPHABET.length - 1)]).join('');
}

function randomOperation(next: (max: number) => number, text: string): TextOperation {
  let after = '';
  let index = 0;
  while (index < text.length) {
    const step = 1 + next(Math.min(5, text.length - index));
    const choice = next(3);
    if (choice === 0) after += text.slice(index, index + step);
    if (choice === 1) after += randomText(next, next(4)) + text.slice(index, index + step);
    index += step;
  }
  if (next(2)) after += randomText(next, next(4));
  return diff(text, after);
}

describe('Opérations sur le texte', () => {
  it('applique garder, insérer et supprimer', () => {
    expect(apply('Bonjour monde', [8, -5, 'équipe'])).toBe('Bonjour équipe');
    expect(apply('', ['Titre'])).toBe('Titre');
  });

  it('refuse une opération qui ne couvre pas tout le texte', () => {
    expect(() => apply('abc', [2])).toThrow(OperationError);
    expect(() => apply('abc', [4])).toThrow(OperationError);
  });

  it('calcule les longueurs avant et après', () => {
    const op: TextOperation = [3, 'xy', -2, 1];
    expect(baseLength(op)).toBe(6);
    expect(targetLength(op)).toBe(6);
    expect(isNoop([5])).toBe(true);
    expect(isNoop(op)).toBe(false);
  });

  it('valide la forme reçue du réseau', () => {
    expect(isValidOperation([3, 'a', -1])).toBe(true);
    expect(isValidOperation([0])).toBe(false);
    expect(isValidOperation([''])).toBe(false);
    expect(isValidOperation([1.5])).toBe(false);
    expect(isValidOperation('abc')).toBe(false);
    expect(isValidOperation([{}])).toBe(false);
  });

  it('ne coupe jamais un emoji en deux', () => {
    const op = diff('a😀b', 'a😃b');
    expect(op).toEqual([1, '😃', -2, 1]);
    expect(isValidOperation(op)).toBe(true);
    expect(isValidOperation([1, '\uD83D'])).toBe(false);
    expect(isWellFormed('😀')).toBe(true);
    expect(isWellFormed('\uDE00')).toBe(false);
  });

  it('décrit une frappe comme la plus petite modification', () => {
    expect(diff('Bonjour', 'Bonjour !')).toEqual([7, ' !']);
    expect(diff('Bonjour', 'Bjour')).toEqual([1, -2, 4]);
    expect(diff('abc', 'abc')).toEqual([3]);
  });

  it('place une frappe ambiguë à l’endroit du curseur', () => {
    expect(diff('aa', 'aaa', 1)).toEqual([1, 'a', 1]);
    expect(diff('aa', 'aaa')).toEqual([2, 'a']);
  });

  it('enchaîne deux opérations en une seule', () => {
    const text = 'Le chat dort';
    const first = diff(text, 'Le gros chat dort');
    const second = diff('Le gros chat dort', 'Le gros chat dort bien');
    expect(apply(text, compose(first, second))).toBe('Le gros chat dort bien');
  });

  it('transforme deux modifications concurrentes vers le même texte', () => {
    const text = 'Réunion lundi';
    const mine = diff(text, 'Réunion lundi matin');
    const theirs = diff(text, 'Grande réunion lundi'.replace('réunion', 'Réunion'));
    const [mine2, theirs2] = transform(mine, theirs);
    expect(apply(apply(text, mine), theirs2)).toBe(apply(apply(text, theirs), mine2));
    expect(apply(apply(text, mine), theirs2)).toBe('Grande Réunion lundi matin');
  });

  it('donne la priorité au premier argument quand deux insertions tombent au même endroit', () => {
    const [a, b] = transform(['A', 3], ['B', 3]);
    expect(apply(apply('xyz', ['A', 3]), b)).toBe('ABxyz');
    expect(apply(apply('xyz', ['B', 3]), a)).toBe('ABxyz');
  });

  it('converge sur des centaines de modifications concurrentes tirées au hasard', () => {
    const next = random(42);
    for (let round = 0; round < 500; round++) {
      const text = randomText(next, next(30));
      const a = randomOperation(next, text);
      const b = randomOperation(next, text);
      expect(isValidOperation(a)).toBe(true);
      const [a2, b2] = transform(a, b);
      expect(isWellFormed(apply(apply(text, a), b2))).toBe(true);
      expect(apply(apply(text, a), b2)).toBe(apply(apply(text, b), a2));
      const c = randomOperation(next, apply(text, a));
      expect(apply(text, compose(a, c))).toBe(apply(apply(text, a), c));
    }
  });

  it('déplace un curseur selon les modifications des autres', () => {
    expect(transformIndex(5, ['abc', 10])).toBe(8);
    expect(transformIndex(5, [5, 'abc', 5])).toBe(5);
    expect(transformIndex(5, [2, -2, 6])).toBe(3);
    expect(transformIndex(5, [3, -5, 2])).toBe(3);
    expect(transformIndex(5, [6, -2, 2])).toBe(5);
  });
});
