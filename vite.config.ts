import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { bookmarkletPlugin } from './scripts/bookmarkletScript.mjs';
import { readAppVersion } from './scripts/appVersion.mjs';

// 画面のフッターに出すバージョン。CI などで指定されていなければ git のタグから求める。
process.env.VITE_APP_VERSION ??= readAppVersion(process.cwd());

export default defineConfig({
  base: './',
  plugins: [react(), bookmarkletPlugin()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'happy-dom']],
    setupFiles: ['./test/setup.ts'],
  },
});
