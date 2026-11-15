import bookmarkletSource from './bookmarklet.src.js?raw';

export function buildBookmarkletUrl(appUrl: string): string {
  return 'javascript:' + encodeURIComponent('(' + bookmarkletSource + ')(' + JSON.stringify(appUrl) + ')');
}
