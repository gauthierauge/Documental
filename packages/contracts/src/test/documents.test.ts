import {
  canManageDocument,
  compareDocuments,
  type DocumentItem,
  documentNameProblem,
  FILE_MAX_BYTES,
  FILE_NAME_MAX,
  fileHref,
  fileNameProblem,
  formatFileSize,
  normalizeDocumentName,
  normalizeFileName,
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
    createdBy: null,
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

describe('Droits sur un document', () => {
  it('réserve la gestion au créateur et aux admins', () => {
    const doc = { createdBy: { id: 'alice', name: 'Alice' } };
    expect(canManageDocument({ id: 'alice', role: 'lecteur' }, doc)).toBe(true);
    expect(canManageDocument({ id: 'bob', role: 'editeur' }, doc)).toBe(false);
    expect(canManageDocument({ id: 'bob', role: 'admin' }, doc)).toBe(true);
    expect(canManageDocument({ id: 'bob', role: 'admin' }, { createdBy: null })).toBe(true);
  });
});

describe('formatFileSize', () => {
  it('passe aux paliers du système, en base 1000', () => {
    expect(formatFileSize(0)).toBe('0 o');
    expect(formatFileSize(940)).toBe('940 o');
    expect(formatFileSize(1_000)).toBe('1 ko');
    expect(formatFileSize(240_000)).toBe('240 ko');
    expect(formatFileSize(2_400_000)).toBe('2,4 Mo');
    expect(formatFileSize(25_000_000)).toBe('25 Mo');
    expect(formatFileSize(3_000_000_000)).toBe('3 Go');
  });

  it('ne traîne pas de décimale inutile', () => {
    expect(formatFileSize(FILE_MAX_BYTES)).toBe('25 Mo');
  });
});

describe('normalizeFileName', () => {
  it('retire le chemin que certains navigateurs envoient', () => {
    expect(normalizeFileName('C:\\Users\\moi\\plan.pdf')).toBe('plan.pdf');
    expect(normalizeFileName('/home/moi/plan.pdf')).toBe('plan.pdf');
  });

  it('resserre les espaces', () => {
    expect(normalizeFileName('  mon   plan.pdf ')).toBe('mon plan.pdf');
  });
});

describe('fileNameProblem', () => {
  it('accepte un nom ordinaire', () => {
    expect(fileNameProblem('plan v2.pdf')).toBeNull();
  });

  it('refuse un nom vide, réservé ou invisible', () => {
    expect(fileNameProblem('   ')).toMatch(/nom/);
    expect(fileNameProblem('..')).toMatch(/réservé/);
    expect(fileNameProblem(`a${String.fromCharCode(0)}b.pdf`)).toMatch(/invisible/);
  });

  it('refuse un nom trop long', () => {
    expect(fileNameProblem(`${'a'.repeat(FILE_NAME_MAX)}.pdf`)).toMatch(/dépasse/);
  });
});

describe('fileHref', () => {
  it('échappe l’identifiant', () => {
    expect(fileHref('a b/c')).toBe('/api/documents/fichiers/a%20b%2Fc');
  });
});
