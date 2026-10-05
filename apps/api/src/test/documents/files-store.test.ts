import { freeName } from '@/documents/files-store';

describe('freeName', () => {
  it('garde le nom quand il est libre', () => {
    expect(freeName(new Set(), 'plan.pdf')).toBe('plan.pdf');
  });

  it('numérote à partir de deux, en gardant l’extension', () => {
    expect(freeName(new Set(['plan.pdf']), 'plan.pdf')).toBe('plan (2).pdf');
    expect(freeName(new Set(['plan.pdf', 'plan (2).pdf']), 'plan.pdf')).toBe('plan (3).pdf');
  });

  it('numérote aussi un nom sans extension', () => {
    expect(freeName(new Set(['notes']), 'notes')).toBe('notes (2)');
  });

  it('ne coupe pas un nom qui commence par un point', () => {
    expect(freeName(new Set(['.gitignore']), '.gitignore')).toBe('.gitignore (2)');
  });
});
