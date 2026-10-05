import { type FileMime, FILE_TYPES } from '@documental/contracts/documents';

const SIGNATURES: { mime: FileMime; offset: number; bytes: number[]; mask?: number[] }[] = [
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
  { mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  {
    mime: 'image/webp',
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    mask: [4, 5, 6, 7],
  },
];

function matches(bytes: Uint8Array, signature: (typeof SIGNATURES)[number]): boolean {
  const skip = new Set(signature.mask ?? []);
  for (let i = 0; i < signature.bytes.length; i += 1) {
    if (skip.has(i)) continue;
    if (bytes[signature.offset + i] !== signature.bytes[i]) return false;
  }
  return true;
}

export function sniffFileMime(bytes: Uint8Array): FileMime | null {
  return SIGNATURES.find((signature) => matches(bytes, signature))?.mime ?? null;
}

export function fileNameFor(name: string, mime: FileMime): string {
  const { extension } = FILE_TYPES[mime];
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  return `${base || 'fichier'}.${extension}`;
}
