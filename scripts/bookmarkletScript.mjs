import { readFileSync } from 'node:fs';
import path from 'node:path';

/** ブックマークレットが読み込む本体の公開パス（アプリと同じ場所に置く）。 */
export const BOOKMARKLET_SCRIPT_NAME = 'bookmarklet.js';

const SOURCE_PATH = 'src/importer/bookmarklet.src.js';
const CONTENT_TYPE = 'text/javascript; charset=utf-8';

function escapeNonAscii(code) {
  return code.replace(/[^\x00-\x7f]/gu, character => {
    let escaped = '';
    for (let i = 0; i < character.length; i++) {
      escaped += '\\u' + character.charCodeAt(i).toString(16).padStart(4, '0');
    }
    return escaped;
  });
}

/**
 * 本体の関数式を、自分の置き場所をアプリの URL として呼び出す classic script にする。
 * 配信側の文字コード指定に左右されないよう、ASCII だけで書き出す。
 * 非 ASCII 文字の置き換えは、文字列とコメントの中でしか意味を保たない。
 * 本体では、非 ASCII 文字を識別子・空白・String.raw などの raw 文字列に使わないこと。
 */
export function buildBookmarkletScript(source) {
  const appUrl = "new URL('./', document.currentScript.src).href";
  return escapeNonAscii(`(${source.trim()})(${appUrl});\n`);
}

function readScript(root) {
  return buildBookmarkletScript(readFileSync(path.resolve(root, SOURCE_PATH), 'utf8'));
}

/** ビルドでは本体を出力し、開発サーバでは同じ内容を配る Vite プラグイン。 */
export function bookmarkletPlugin() {
  let root = process.cwd();
  return {
    name: 'shodou-bookmarklet',
    configResolved(config) { root = config.root; },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: BOOKMARKLET_SCRIPT_NAME, source: readScript(root) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/' + BOOKMARKLET_SCRIPT_NAME) return next();
        response.setHeader('Content-Type', CONTENT_TYPE);
        response.end(readScript(root));
      });
    },
  };
}
