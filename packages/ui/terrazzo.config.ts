import { defineConfig } from '@terrazzo/cli';
import css from '@terrazzo/plugin-css';
import { cssModes, lintEveryVariant, rules } from './design/terrazzo';

// Les jetons de design (design/, format DTCG 2025.10) compilés en variables CSS. Le lint vérifie
// les contrastes AA du thème en clair et en sombre : `tz build` échoue sur un thème illisible.
// Le CSS compilé n'est pas versionné : `bun run dev` et `bun run build` le refont.

export default defineConfig({
  tokens: ['./design/design.resolver.json'],
  outDir: './src/',
  plugins: [css({ filename: 'jetons.css', permutations: cssModes() }), lintEveryVariant()],
  // Le lint passe dans lintEveryVariant(), sur chaque variante (voir design/terrazzo.ts).
  lint: { build: { enabled: false }, rules },
});
