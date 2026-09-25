import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/app/**/*.test.ts', 'tests/ui/**/*.test.tsx'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 10000,
  },
});
