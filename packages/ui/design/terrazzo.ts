import {
  type ConfigInit,
  type LintRuleLonghand,
  type LintRuleShorthand,
  lintRunner,
  type Plugin,
} from '@terrazzo/parser';

// La configuration Terrazzo commune au kit et aux projets : la porte qualité du design system
// (`tz build` échoue si une règle casse : un thème illisible ne part jamais en production) et
// la façon d'écrire les modes clair et sombre en CSS.

/** Les paires texte / fond réellement utilisées par les écrans : contraste AA (4,5:1). */
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

/** Les éléments d'interface qui doivent se voir sur leur fond : 3:1 (WCAG 1.4.11). */
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
  // 12 px au plus petit, même pour une légende.
  'a11y/min-font-size': ['error', { minSizeRem: 0.75 }],
  'core/required-type': 'error',
  'core/consistent-naming': ['error', { format: 'kebab-case' }],
  // sRGB : chaque couleur s'affiche pareil sur tous les écrans et son hex de secours est exact.
  'core/max-gamut': ['error', { gamut: 'srgb' }],
};

/** « Pair 3 failed » devient « couleur.lien sur couleur.fond » : on voit tout de suite quoi corriger. */
function explain(message: string): string {
  const lines = message.split('\n').map((line) =>
    line.replace(/Pair (\d+) failed/, (all, n: string) => {
      const pair = PAIRS[Number(n) - 1];
      return pair ? `${pair.foreground} sur ${pair.background} : contraste insuffisant` : all;
    }),
  );
  return [...new Set(lines.filter((line) => line.trim()))].join('\n');
}

/**
 * Terrazzo ne passe le lint que sur la variante par défaut du resolver. Ce plugin passe les
 * mêmes règles sur chaque variante (clair et sombre, et chaque thème dans le kit) : une seule
 * paire illisible, où qu'elle soit, arrête `tz build`. (Le lint d'origine est coupé dans la
 * config : il ne ferait que répéter la variante par défaut, avec des messages moins clairs.)
 */
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

/** Les jetons qui changent avec le mode : seuls eux sont réécrits pour le mode sombre. */
const DARK = ['couleur.**', 'ombre.**'];

/**
 * Les variantes CSS : clair par défaut ; sombre si le système le demande, sauf si le visiteur a
 * choisi « clair » (data-theme sur <html>) ; sombre toujours si le visiteur l'a choisi.
 */
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
