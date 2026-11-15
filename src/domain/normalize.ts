/** 幅・英字大小・空白の違いを除いた照合用文字列を返す。 */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

/** 文字列を正規表現のリテラルとして使える形にする。 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
