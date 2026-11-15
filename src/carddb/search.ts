import { normalizeForSearch } from '../domain/normalize';
import type { CardData } from '../domain/types';

const DEFAULT_SEARCH_LIMIT = 30;

/** normalizeForSearch で正規化した名前と読みを持つ検索対象。 */
export interface CardSearchEntry {
  card: CardData;
  name: string;
  kana: string;
}

/** 名前と読みを検索し、前方一致を優先して返す。 */
export function searchCards(
  index: readonly CardSearchEntry[], query: string, limit = DEFAULT_SEARCH_LIMIT,
): CardData[] {
  const normalized = normalizeForSearch(query);
  if (!normalized || limit <= 0) return [];
  const prefix: CardData[] = [];
  const partial: CardData[] = [];
  for (const entry of index) {
    const namePosition = entry.name.indexOf(normalized);
    const kanaPosition = entry.kana.indexOf(normalized);
    if (namePosition === 0 || kanaPosition === 0) prefix.push(entry.card);
    else if (namePosition >= 0 || kanaPosition >= 0) {
      partial.push(entry.card);
    }
  }
  const compare = (left: CardData, right: CardData) =>
    left.name.length - right.name.length || left.name.localeCompare(right.name, 'ja');
  prefix.sort(compare);
  partial.sort(compare);
  return prefix.concat(partial).slice(0, limit);
}
