import react from '@vitejs/plugin-react';
import {configDefaults, defineConfig} from 'vitest/config';

// jsdom's dependencies use require(esm), which VM pools only support on
// Node 24.9+. Older Node versions use isolated forks instead.
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const unitPool =
  nodeMajor > 24 || (nodeMajor === 24 && nodeMinor >= 9)
    ? 'vmThreads'
    : 'forks';

export default defineConfig({
  resolve: {
    // Workspace packages resolve to their TypeScript sources
    conditions: [
      'mochinori-source',
      'development',
      'import',
      'module',
      'browser',
    ],
    dedupe: ['react', 'react-dom', 'lexical'],
  },
  test: {
    clearMocks: true,
    projects: [
      {
        define: {
          IS_REACT_ACT_ENVIRONMENT: true,
        },
        extends: true,
        plugins: [react()],
        test: {
          environment: 'jsdom',
          exclude: [...configDefaults.exclude, '**/build/**', '**/dist/**'],
          include: [
            'packages/**/__tests__/unit/**/*.test{.ts,.tsx,.js,.jsx}',
            'cloudflare/**/__tests__/unit/**/*.test{.ts,.tsx}',
            'scripts/__tests__/unit/**/*.test{.ts,.tsx}',
          ],
          name: 'unit',
          pool: unitPool,
        },
      },
    ],
  },
});
