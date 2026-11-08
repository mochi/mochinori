import react from '@vitejs/plugin-react';
import {configDefaults, defineConfig} from 'vitest/config';

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
  // Tests in the node environment resolve through Vite's SSR conditions
  ssr: {
    resolve: {
      conditions: [
        'mochinori-source',
        'development',
        'import',
        'module',
        'node',
      ],
    },
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
            'scripts/__tests__/unit/**/*.test{.ts,.tsx}',
          ],
          name: 'unit',
          // jsdom's dependencies use require(esm), which VM pools support on
          // the Node versions this repo requires (24.22+)
          pool: 'vmThreads',
        },
      },
    ],
  },
});
