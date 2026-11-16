import type { Plugin } from 'vite';

/** ブックマークレットが読み込む本体の公開パス（アプリと同じ場所に置く）。 */
export const BOOKMARKLET_SCRIPT_NAME: string;

/** 本体の関数式を、自分の置き場所をアプリの URL として呼び出す classic script にする。 */
export function buildBookmarkletScript(source: string): string;

/** ビルドでは本体を出力し、開発サーバでは同じ内容を配る Vite プラグイン。 */
export function bookmarkletPlugin(): Plugin;
