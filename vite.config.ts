import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'happy-dom']],
    setupFiles: ['./test/setup.ts'],
  },
});
