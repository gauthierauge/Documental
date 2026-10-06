import { fileNameFor, sniffFileMime } from '@/documents/file-type';

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const GIF89 = [...'GIF89a'].map((c) => c.charCodeAt(0));
const GIF87 = [...'GIF87a'].map((c) => c.charCodeAt(0));
const WEBP = [...'RIFF']
  .map((c) => c.charCodeAt(0))
  .concat([0x2a, 0x13, 0x00, 0x00])
  .concat([...'WEBP'].map((c) => c.charCodeAt(0)));

const bytes = (values: number[]) => new Uint8Array(values);

describe('sniffFileMime', () => {
  it('reconnaît chaque type accepté par ses octets de tête', () => {
    expect(sniffFileMime(bytes(PDF))).toBe('application/pdf');
    expect(sniffFileMime(bytes(PNG))).toBe('image/png');
    expect(sniffFileMime(bytes(JPEG))).toBe('image/jpeg');
    expect(sniffFileMime(bytes(GIF87))).toBe('image/gif');
    expect(sniffFileMime(bytes(GIF89))).toBe('image/gif');
  });

  it('reconnaît un WebP quelle que soit la taille inscrite au milieu', () => {
    expect(sniffFileMime(bytes(WEBP))).toBe('image/webp');
    const autre = [...WEBP];
    autre[4] = 0xff;
    autre[7] = 0xff;
    expect(sniffFileMime(bytes(autre))).toBe('image/webp');
  });

  it('refuse ce qui n’est pas dans la liste blanche', () => {
    const svg = [...'<svg onload=alert(1)>'].map((c) => c.charCodeAt(0));
    const html = [...'<!DOCTYPE html>'].map((c) => c.charCodeAt(0));
    const zip = [0x50, 0x4b, 0x03, 0x04];
    const elf = [0x7f, 0x45, 0x4c, 0x46];
    for (const hostile of [svg, html, zip, elf]) {
      expect(sniffFileMime(bytes(hostile))).toBeNull();
    }
  });

  it('refuse un fichier trop court pour porter une signature', () => {
    expect(sniffFileMime(bytes([]))).toBeNull();
    expect(sniffFileMime(bytes([0x25, 0x50]))).toBeNull();
    expect(sniffFileMime(bytes([...'RIFF'].map((c) => c.charCodeAt(0))))).toBeNull();
  });

  it('ne se laisse pas tromper par un PNG annoncé qui commence par du HTML', () => {
    const faux = [...'<script>'].map((c) => c.charCodeAt(0)).concat(PNG);
    expect(sniffFileMime(bytes(faux))).toBeNull();
  });
});

describe('fileNameFor', () => {
  it('impose l’extension du type réellement reconnu', () => {
    expect(fileNameFor('rapport.png', 'application/pdf')).toBe('rapport.pdf');
    expect(fileNameFor('photo', 'image/jpeg')).toBe('photo.jpg');
    expect(fileNameFor('plan.pdf', 'application/pdf')).toBe('plan.pdf');
  });

  it('garde les points qui font partie du nom', () => {
    expect(fileNameFor('notes.v2.final.pdf', 'application/pdf')).toBe('notes.v2.final.pdf');
  });

  it('donne un nom à un fichier qui n’en a plus après coupe', () => {
    expect(fileNameFor('.pdf', 'application/pdf')).toBe('fichier.pdf');
  });
});
