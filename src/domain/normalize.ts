/** 幅・英字大小・空白の違いを除いた照合用文字列を返す。 */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

/** 幅・英字大小・空白に加え、ひらがなとカタカナの違いを除いて照合する。 */
export function normalizeKana(text: string): string {
  return normalizeForMatch(text).replace(/[\u30a1-\u30f6\u30fd\u30fe]/g,
    character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

/** カード検索用に、かなをそろえて中点・ハイフン類・等号を除く。 */
export function normalizeForSearch(text: string): string {
  return normalizeKana(text).replace(/[・\-‐‑‒–—―−=]/g, '');
}

/** 文字列を正規表現のリテラルとして使える形にする。 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
