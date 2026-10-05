import type { CommittedOperation } from '@documental/contracts/edition';
import { apply, diff, type TextOperation, transform } from '@documental/contracts/text-operation';
import { EditionSession, OutOfSyncError } from '@/edition/session';

function ids() {
  let n = 0;
  return () => `op-${++n}`;
}

function committed(revision: number, operation: TextOperation, id = `autre-${revision}`) {
  return { id, revision, operation, author: null } satisfies CommittedOperation;
}

describe('Session d’édition', () => {
  it('regroupe les frappes en une seule modification à envoyer', () => {
    const session = new EditionSession(
      { text: 'Bonjour', revision: 3, outstanding: null, buffer: null },
      ids(),
    );
    session.local(diff('Bonjour', 'Bonjour à'));
    session.local(diff('Bonjour à', 'Bonjour à tous'));
    expect(session.text).toBe('Bonjour à tous');
    expect(session.nextSubmission()).toEqual({
      id: 'op-1',
      base: 3,
      operation: [7, ' à tous'],
    });
  });

  it('n’envoie qu’une modification à la fois et garde les suivantes de côté', () => {
    const session = new EditionSession(
      { text: '', revision: 0, outstanding: null, buffer: null },
      ids(),
    );
    session.local(['a']);
    expect(session.nextSubmission()?.id).toBe('op-1');
    session.local([1, 'b']);
    expect(session.nextSubmission()).toEqual({ id: 'op-1', base: 0, operation: ['a'] });
    session.settle({ revision: 1, missed: [] });
    expect(session.nextSubmission()).toEqual({ id: 'op-2', base: 1, operation: [1, 'b'] });
    session.settle({ revision: 2, missed: [] });
    expect(session.pending).toBe(false);
    expect(session.nextSubmission()).toBeNull();
  });

  it('intègre les modifications des autres reçues avec la confirmation', () => {
    const session = new EditionSession(
      { text: 'Réunion lundi', revision: 1, outstanding: null, buffer: null },
      ids(),
    );
    session.local(diff('Réunion lundi', 'Réunion lundi matin'));
    const sent = session.nextSubmission();
    session.local(diff('Réunion lundi matin', 'Réunion lundi matin !'));
    const fromBob = diff('Réunion lundi', 'Grande Réunion lundi');
    const applied = session.settle({ revision: 3, missed: [committed(2, fromBob)] });
    expect(session.text).toBe('Grande Réunion lundi matin !');
    expect(applied).toHaveLength(1);
    expect(session.revision).toBe(3);

    const onServer = apply(
      apply('Réunion lundi', fromBob),
      transform(fromBob, sent?.operation ?? [])[1],
    );
    expect(session.nextSubmission()?.operation).toEqual(
      diff(onServer, 'Grande Réunion lundi matin !'),
    );
  });

  it('reconnaît sa propre modification dans un rattrapage', () => {
    const session = new EditionSession(
      { text: 'ab', revision: 4, outstanding: { id: 'mien', operation: ['a', 1] }, buffer: null },
      ids(),
    );
    expect(session.remote(committed(5, ['a', 1], 'mien'))).toBeNull();
    expect(session.pending).toBe(false);
    expect(session.revision).toBe(5);
    expect(session.text).toBe('ab');
  });

  it('se sait désynchronisée si une version manque', () => {
    const session = EditionSession.fresh('x', 2);
    expect(() => session.remote(committed(4, [1, 'y']))).toThrow(OutOfSyncError);
  });

  it('se sauvegarde et se restaure telle quelle', () => {
    const session = new EditionSession(
      { text: 'ab', revision: 1, outstanding: null, buffer: null },
      ids(),
    );
    session.local([2, 'c']);
    session.nextSubmission();
    session.local([3, 'd']);
    const restored = new EditionSession(session.snapshot(), ids());
    expect(restored.text).toBe('abcd');
    expect(restored.nextSubmission()).toEqual({ id: 'op-1', base: 1, operation: [2, 'c'] });
    restored.settle({ revision: 2, missed: [] });
    expect(restored.nextSubmission()).toMatchObject({ base: 2, operation: [3, 'd'] });
  });
});
