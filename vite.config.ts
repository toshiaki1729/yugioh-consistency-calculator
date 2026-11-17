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
    setupFiles: ['./test/setup.ts'],
    // 画面のテスト（.tsx）だけ DOM の環境で動かす。
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: ['**/*.test.ts'] } },
      { extends: true, test: { name: 'dom', environment: 'happy-dom', include: ['**/*.test.tsx'] } },
    ],
  },
});
