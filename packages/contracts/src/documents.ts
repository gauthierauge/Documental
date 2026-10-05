export const DOCUMENT_KINDS = ['folder', 'text', 'file'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  folder: 'Dossier',
  text: 'Document',
  file: 'Fichier',
};

export const DOCUMENT_NAME_MAX = 120;

export interface DocumentPerson {
  id: string;
  name: string;
}

export interface DocumentItem {
  id: string;
  kind: DocumentKind;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: DocumentPerson | null;
}

export interface DocumentCrumb {
  id: string;
  name: string;
}

export interface FolderListing {
  folder: DocumentItem | null;
  path: DocumentCrumb[];
  items: DocumentItem[];
  canEdit: boolean;
}

export interface DocumentDetail {
  item: DocumentItem;
  path: DocumentCrumb[];
  canEdit: boolean;
}

export interface FolderSummary {
  id: string;
  name: string;
  parentId: string | null;
}

export function normalizeDocumentName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function documentNameProblem(value: string): string | null {
  const name = normalizeDocumentName(value);
  if (!name) return 'Le nom est obligatoire.';
  if (name.length > DOCUMENT_NAME_MAX) return `Le nom dépasse ${DOCUMENT_NAME_MAX} caractères.`;
  if (name === '.' || name === '..') return 'Ce nom est réservé.';
  if (/[/\\]/.test(name)) return 'Le nom ne peut pas contenir / ni \\.';
  if (/\p{Cc}/u.test(name)) return 'Le nom contient un caractère invisible.';
  return null;
}

export function compareDocuments(a: DocumentItem, b: DocumentItem): number {
  if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
}
