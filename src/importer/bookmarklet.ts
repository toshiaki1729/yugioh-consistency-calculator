import bookmarkletSource from './bookmarklet.src.js?raw';

/** アプリの取り込み先を埋め込んだブックマークレットを作る。 */
export function buildBookmarkletUrl(appUrl: string): string {
  const invocation = '(' + bookmarkletSource + ')(' + JSON.stringify(appUrl) + ')';
  return 'javascript:' + encodeURIComponent(invocation);
}
