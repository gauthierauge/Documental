import type { DocumentItem, FolderSummary } from '@documental/contracts/documents';
import { moveTargets } from '@/documents/ItemActions';

const folders: FolderSummary[] = [
  { id: 'a', name: 'Équipe', parentId: null },
  { id: 'b', name: 'Comptes rendus', parentId: 'a' },
  { id: 'c', name: '2026', parentId: 'b' },
  { id: 'd', name: 'Archives', parentId: null },
];

function moved(id: string, kind: DocumentItem['kind'] = 'folder'): DocumentItem {
  return {
    id,
    kind,
    name: id,
    parentId: null,
    createdAt: '',
    updatedAt: '',
    updatedBy: null,
  };
}

describe('Destinations d’un déplacement', () => {
  it('affiche le chemin complet de chaque dossier', () => {
    expect(moveTargets(folders, moved('x', 'text')).map((t) => t.label)).toEqual([
      'Archives',
      'Équipe',
      'Équipe / Comptes rendus',
      'Équipe / Comptes rendus / 2026',
    ]);
  });

  it('exclut le dossier déplacé et ses sous-dossiers', () => {
    expect(moveTargets(folders, moved('b')).map((t) => t.id)).toEqual(['d', 'a']);
  });
});
