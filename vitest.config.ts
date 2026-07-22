import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // App code lives at the repo root (app/, components/, lib/, hooks/, contexts/),
    // so tests may live anywhere except build/vendor output.
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '.next/**', 'coverage/**', 'prisma/migrations/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'coverage/**',
        'components/ui/**',
        'components/magicui/**',
        'prisma/**',
        'test/**',
        '**/*.config.{ts,mts,mjs}',
        'next-env.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      // Must match tsconfig.json `paths`: "@/*" -> "./*" (repo root, no src/).
      '@': resolve(__dirname, '.'),
    },
  },
});
