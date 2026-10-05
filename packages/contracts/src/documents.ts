export const DOCUMENT_KINDS = ['folder', 'text', 'file'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  folder: 'Dossier',
  text: 'Document',
  file: 'Fichier',
};

export const DOCUMENT_NAME_MAX = 120;

export const FILE_TYPES = {
  'application/pdf': { extension: 'pdf', label: 'PDF' },
  'image/png': { extension: 'png', label: 'Image PNG' },
  'image/jpeg': { extension: 'jpg', label: 'Image JPEG' },
  'image/webp': { extension: 'webp', label: 'Image WebP' },
  'image/gif': { extension: 'gif', label: 'Image GIF' },
} as const;

export type FileMime = keyof typeof FILE_TYPES;

export const FILE_MIMES = Object.keys(FILE_TYPES) as FileMime[];

export function isFileMime(value: string): value is FileMime {
  return Object.hasOwn(FILE_TYPES, value);
}

export const FILE_MAX_BYTES = 25_000_000;

export const DOCUMENT_FILES_MAX = 50;

export const DOCUMENT_BYTES_MAX = 200_000_000;

export const FILE_NAME_MAX = 180;

export const FILE_USAGES = ['attachment', 'inline'] as const;
export type FileUsage = (typeof FILE_USAGES)[number];

export const IMAGE_MIMES = FILE_MIMES.filter((mime) => mime.startsWith('image/'));

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/') && isFileMime(mime);
}

export interface DocumentFile {
  id: string;
  documentId: string;
  name: string;
  mime: FileMime;
  size: number;
  usage: FileUsage;
  createdAt: string;
  createdBy: DocumentPerson | null;
}

export function formatFileSize(bytes: number): string {
  const units = ['o', 'ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: decimals })} ${units[unit]}`;
}

export function normalizeFileName(value: string): string {
  const base = value.split(/[/\\]/).pop() ?? '';
  return base.trim().replace(/\s+/g, ' ');
}

export function fileNameProblem(value: string): string | null {
  const name = normalizeFileName(value);
  if (!name) return 'Le fichier doit avoir un nom.';
  if (name.length > FILE_NAME_MAX) return `Le nom dépasse ${FILE_NAME_MAX} caractères.`;
  if (name === '.' || name === '..') return 'Ce nom est réservé.';
  if (/\p{Cc}/u.test(name)) return 'Le nom contient un caractère invisible.';
  return null;
}

export function fileHref(fileId: string): string {
  return `/api/documents/fichiers/${encodeURIComponent(fileId)}`;
}

export function markdownImageRef(file: Pick<DocumentFile, 'id' | 'name'>): string {
  const alt = file.name.replace(/[[\]]/g, '').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  return `![${alt}](${fileHref(file.id)})`;
}

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
  createdBy: DocumentPerson | null;
}

export interface DocumentCrumb {
  id: string;
  name: string;
}

export interface FolderListing {
  folder: DocumentItem | null;
  path: DocumentCrumb[];
  items: DocumentItem[];
  canCreate: boolean;
}

export interface DocumentAccess {
  write: boolean;
  manage: boolean;
}

export interface DocumentDetail {
  item: DocumentItem;
  path: DocumentCrumb[];
  files: DocumentFile[];
  access: DocumentAccess;
}

export interface Collaborator extends DocumentPerson {
  email: string;
  invitedAt: string;
}

export interface CollaboratorList {
  owner: DocumentPerson | null;
  collaborators: Collaborator[];
  canManage: boolean;
}

export interface InvitableAccount extends DocumentPerson {
  email: string;
}

export function canManageDocument(
  user: { id: string; role: string },
  item: Pick<DocumentItem, 'createdBy'>,
): boolean {
  return user.role === 'admin' || item.createdBy?.id === user.id;
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
