import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { bookmarkletPlugin } from './scripts/bookmarkletScript.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), bookmarkletPlugin()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'happy-dom']],
    setupFiles: ['./test/setup.ts'],
  },
});
