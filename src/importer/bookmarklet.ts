/** ブックマークレットが読み込む本体の置き場所（アプリと同じ場所。scripts/bookmarkletScript.mjs と揃える）。 */
export const BOOKMARKLET_SCRIPT_NAME = 'bookmarklet.js';

const LOAD_ERROR = '初動率計算機から、取り込み用のプログラムを読み込めませんでした';

/**
 * アプリから本体を読み込む短いブックマークレットを作る。
 * Android の Chrome はブックマークの編集欄（1 行の入力欄）で URL を 5,000 文字で切るため、本体は埋め込まない。
 * 読み込み先にはデッキの情報も公式ページの URL（Referer）も渡さない。
 */
export function buildBookmarkletUrl(appUrl: string): string {
  const scriptUrl = new URL(BOOKMARKLET_SCRIPT_NAME, appUrl).href;
  const loader = '(function(){var s=document.createElement("script");'
    + `s.src=${JSON.stringify(scriptUrl + '?t=')}+Date.now();`
    + 's.referrerPolicy="no-referrer";'
    + 's.onload=function(){s.remove()};'
    + `s.onerror=function(){s.remove();alert(${JSON.stringify(LOAD_ERROR)})};`
    + 'document.documentElement.appendChild(s)})()';
  return 'javascript:' + encodeURIComponent(loader);
}
