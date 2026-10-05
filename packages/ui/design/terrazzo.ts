import {
  type ConfigInit,
  type LintRuleLonghand,
  type LintRuleShorthand,
  lintRunner,
  type Plugin,
} from '@terrazzo/parser';

const TEXT_PAIRS: [string, string][] = [
  ...['fond', 'surface', 'surface-elevee', 'surface-enfoncee'].flatMap((bg): [string, string][] => [
    ['couleur.texte', `couleur.${bg}`],
    ['couleur.texte-attenue', `couleur.${bg}`],
    ['couleur.lien', `couleur.${bg}`],
  ]),
  ['couleur.accent-texte', 'couleur.accent'],
  ['couleur.accent-texte', 'couleur.accent-survol'],
  ['couleur.accent-sur-doux', 'couleur.accent-doux'],
  ...['succes', 'attention', 'danger'].flatMap((tone): [string, string][] => [
    [`couleur.${tone}`, `couleur.${tone}-fond`],
    [`couleur.${tone}`, 'couleur.surface'],
  ]),
  ['bouton.primaire.texte', 'bouton.primaire.fond'],
  ['bouton.primaire.texte', 'bouton.primaire.fond-survol'],
  ['bouton.secondaire.texte', 'bouton.secondaire.fond'],
  ['bouton.secondaire.texte', 'bouton.secondaire.fond-survol'],
  ['bouton.danger.texte', 'bouton.danger.fond-survol'],
  ['champ.texte', 'champ.fond'],
  ['champ.aide', 'champ.fond'],
  ['tableau.entete-texte', 'tableau.entete-fond'],
  ['navigation.texte', 'navigation.fond'],
  ['navigation.texte-actif', 'navigation.fond-actif'],
  ...['neutre', 'accent', 'succes', 'attention', 'danger'].map((tone): [string, string] => [
    `badge.${tone}.texte`,
    `badge.${tone}.fond`,
  ]),
];

const UI_PAIRS: [string, string][] = [
  ['couleur.focus', 'couleur.fond'],
  ['couleur.focus', 'couleur.surface'],
  ['couleur.bordure-forte', 'couleur.surface'],
  ['couleur.bordure-forte', 'couleur.surface-enfoncee'],
  ['champ.bordure', 'champ.fond'],
];

const PAIRS = [
  ...TEXT_PAIRS.map(([foreground, background]) => ({ foreground, background })),
  ...UI_PAIRS.map(([foreground, background]) => ({ foreground, background, largeText: true })),
];

export const rules: Record<string, LintRuleShorthand | LintRuleLonghand> = {
  'a11y/min-contrast': ['error', { level: 'AA', pairs: PAIRS }],
  'a11y/min-font-size': ['error', { minSizeRem: 0.75 }],
  'core/required-type': 'error',
  'core/consistent-naming': ['error', { format: 'kebab-case' }],
  'core/max-gamut': ['error', { gamut: 'srgb' }],
};

function explain(message: string): string {
  const lines = message.split('\n').map((line) =>
    line.replace(/Pair (\d+) failed/, (all, n: string) => {
      const pair = PAIRS[Number(n) - 1];
      return pair ? `${pair.foreground} sur ${pair.background} : contraste insuffisant` : all;
    }),
  );
  return [...new Set(lines.filter((line) => line.trim()))].join('\n');
}

export function lintEveryVariant(): Plugin {
  let config: ConfigInit | undefined;
  return {
    name: 'lint-toutes-les-variantes',
    config(init) {
      config = init;
    },
    async build({ resolver, sources, context }) {
      const variants = resolver.listPermutations?.();
      if (!config || !variants) throw new Error('Resolver trop complexe : variantes introuvables');
      for (const input of variants) {
        try {
          await lintRunner({
            tokens: resolver.apply(input),
            sources,
            config,
            logger: context.logger,
          });
        } catch (error) {
          const label = Object.entries(input)
            .map(([name, value]) => `${name} ${value}`)
            .join(', ');
          throw new Error(
            `Variante ${label} :\n${explain(error instanceof Error ? error.message : String(error))}`,
          );
        }
      }
    },
  };
}

const DARK = ['couleur.**', 'ombre.**'];

export function cssModes() {
  return [
    {
      input: { mode: 'clair' },
      prepare: (tokens: string) => `:root {\n  color-scheme: light;\n  ${tokens}\n}`,
    },
    {
      input: { mode: 'sombre' },
      include: DARK,
      prepare: (tokens: string) =>
        `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='clair']) {\n    color-scheme: dark;\n    ${tokens}\n  }\n}`,
    },
    {
      input: { mode: 'sombre' },
      include: DARK,
      prepare: (tokens: string) =>
        `:root[data-theme='sombre'] {\n  color-scheme: dark;\n  ${tokens}\n}`,
    },
  ];
}
