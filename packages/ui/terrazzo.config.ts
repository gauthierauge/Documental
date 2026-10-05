import { defineConfig } from '@terrazzo/cli';
import css from '@terrazzo/plugin-css';
import { cssModes, lintEveryVariant, rules } from './design/terrazzo';

export default defineConfig({
  tokens: ['./design/design.resolver.json'],
  outDir: './src/',
  plugins: [css({ filename: 'jetons.css', permutations: cssModes() }), lintEveryVariant()],
  lint: { build: { enabled: false }, rules },
});
