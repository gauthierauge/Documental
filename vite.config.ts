import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite-plus';
import { oxlint } from './infrastructure/lint/oxlint';

const at = (dir: string) => fileURLToPath(new URL(`./${dir}`, import.meta.url));

export default defineConfig({
  plugins: [react() as unknown as PluginOption],
  lint: oxlint,
  fmt: {
    singleQuote: true,
    printWidth: 100,
    ignorePatterns: ['**/dist/**', '**/coverage/**', 'apps/api/drizzle/**'],
  },
  resolve: { tsconfigPaths: true },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          root: at('apps/api'),
          include: ['src/test/**/*.test.{ts,tsx}'],
          globalSetup: ['src/test/support/database-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          root: at('apps/web'),
          include: ['src/test/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/support/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'contracts',
          root: at('packages/contracts'),
          include: ['src/test/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'infrastructure',
          root: at('infrastructure'),
          include: ['test/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
