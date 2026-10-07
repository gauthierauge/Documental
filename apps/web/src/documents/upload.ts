import {
  type DocumentFile,
  FILE_MAX_BYTES,
  type FileUsage,
  formatFileSize,
  isImageMime,
} from '@documental/contracts/documents';
import { api, ApiError } from '@/api';

export function uploadProblem(file: File): string | null {
  if (file.size === 0) return `« ${file.name} » est vide.`;
  if (file.size > FILE_MAX_BYTES) {
    return `« ${file.name} » dépasse ${formatFileSize(FILE_MAX_BYTES)}.`;
  }
  return null;
}

export async function uploadFile(
  documentId: string,
  file: File,
  usage: FileUsage,
): Promise<DocumentFile> {
  const problem = uploadProblem(file);
  if (problem) throw new ApiError(413, problem);
  const body = new FormData();
  body.set('fichier', file);
  body.set('usage', usage);
  const { file: added } = await api<{ file: DocumentFile }>(
    `/documents/fichiers/${encodeURIComponent(documentId)}`,
    { method: 'POST', body },
  );
  return added;
}

export function uploadFailure(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Envoi impossible pour le moment, réessayez.';
}

export function imagesOf(items: FileList | File[] | null | undefined): File[] {
  return Array.from(items ?? []).filter((file) => isImageMime(file.type));
}

export function pastedImages(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromFiles = imagesOf(data.files);
  if (fromFiles.length > 0) return fromFiles;
  const fromItems = [...data.items]
    .filter((item) => item.kind === 'file' && isImageMime(item.type))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return fromItems;
}
