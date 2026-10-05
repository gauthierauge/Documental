import {
  exportsOnlyTypes,
  globToRegExp,
  judge,
  type Policy,
  probe,
  report,
} from '@/scripts/check-tests';

const policy: Policy = {
  roots: [
    { code: 'src', tests: 'tests' },
    { code: 'scripts', tests: 'tests/scripts' },
  ],
  required: ['src/domain/**', '**/*.usecase.ts'],
  exempt: ['**/index.ts', '**/*.dto.ts'],
  probes: {
    required: 'src/m/usecases/sonde/sonde.usecase.ts',
    exempt: 'src/m/usecases/sonde/sonde.dto.ts',
  },
};

const code = (text: Record<string, string>) => (path: string) =>
  text[path] ?? 'export const a = 1;\n';

describe('politique de tests', () => {
  it('lit les motifs ** et *', () => {
    expect(globToRegExp('**/*.usecase.ts').test('src/m/usecases/a/a.usecase.ts')).toBe(true);
    expect(globToRegExp('**/*.usecase.ts').test('a.usecase.ts')).toBe(true);
    expect(globToRegExp('src/domain/**').test('src/domain/x/y.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
  });

  it('reconnaît un fichier qui n’exporte que des types', () => {
    expect(exportsOnlyTypes('export type A = 1;\nexport interface B {}\n')).toBe(true);
    expect(exportsOnlyTypes('export type A = 1;\nexport const b = 2;\n')).toBe(false);
  });

  it('exige le test des fichiers visés, sauf exemptés ou purement typés', () => {
    const files = [
      'src/domain/a.ts',
      'src/domain/index.ts',
      'src/domain/types.ts',
      'src/m/usecases/x/x.usecase.ts',
      'src/m/usecases/x/x.dto.ts',
      'src/web/libre.ts',
      'tests/domain/a.test.ts',
    ];
    const verdict = judge(policy, files, code({ 'src/domain/types.ts': 'export type T = 1;\n' }));
    expect(verdict.missing).toEqual(['src/m/usecases/x/x.usecase.ts']);
    expect(report(policy, verdict)).toEqual([
      '  src/m/usecases/x/x.usecase.ts : test exigé par la politique de tests (tests/m/usecases/x/x.usecase.test.ts)',
    ]);
  });

  it('refuse un test orphelin et range les tests des scripts à part', () => {
    const files = [
      'scripts/a.ts',
      'tests/scripts/a.test.ts',
      'tests/b.test.tsx',
      'tests/support/outil.ts',
    ];
    expect(judge(policy, files, code({})).orphans).toEqual(['tests/b.test.tsx']);
  });

  it('prouve la politique par ses sondes', () => {
    expect(probe(policy, [], code({}))).toEqual([]);
    expect(probe({ ...policy, required: [] }, [], code({}))).toEqual([
      "src/m/usecases/sonde/sonde.usecase.ts sans test n'est pas refusé",
    ]);
  });
});
