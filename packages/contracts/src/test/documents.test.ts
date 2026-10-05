import {
  compareDocuments,
  type DocumentItem,
  documentNameProblem,
  normalizeDocumentName,
} from '@documental/contracts/documents';

function item(kind: DocumentItem['kind'], name: string): DocumentItem {
  return {
    id: name,
    kind,
    name,
    parentId: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    updatedAt: '2026-10-05T10:00:00.000Z',
    updatedBy: null,
  };
}

describe('Noms des documents', () => {
  it('retire les espaces en trop', () => {
    expect(normalizeDocumentName('  Compte   rendu  ')).toBe('Compte rendu');
  });

  it('accepte un nom ordinaire', () => {
    expect(documentNameProblem('Réunion du 5 octobre.pdf')).toBeNull();
  });

  it('refuse un nom vide, trop long, réservé ou avec un séparateur', () => {
    expect(documentNameProblem('   ')).toBe('Le nom est obligatoire.');
    expect(documentNameProblem('a'.repeat(121))).toMatch(/120 caractères/);
    expect(documentNameProblem('..')).toBe('Ce nom est réservé.');
    expect(documentNameProblem('a/b')).toMatch(/\//);
    expect(documentNameProblem('a\\b')).toMatch(/\//);
    expect(documentNameProblem('a\u0000b')).toMatch(/invisible/);
  });
});

describe('Ordre des documents', () => {
  it('range les dossiers d’abord, puis par nom dans l’ordre naturel', () => {
    const sorted = [
      item('text', 'Note 10'),
      item('folder', 'Zèbre'),
      item('text', 'note 2'),
      item('folder', 'archives'),
    ].sort(compareDocuments);
    expect(sorted.map((i) => i.name)).toEqual(['archives', 'Zèbre', 'note 2', 'Note 10']);
  });
});
