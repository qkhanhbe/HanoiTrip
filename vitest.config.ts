import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/app/**/*.test.ts', 'tests/ui/**/*.test.tsx'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['app/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary', 'lcov', 'cobertura'],
      // Whole-app baseline measured 2026-10-14; includes unimported map/entry files.
      thresholds: { lines: 63, statements: 61, functions: 63, branches: 59 },
    },
  },
});
