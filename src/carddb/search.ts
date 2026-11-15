import { normalizeForMatch } from '../domain/normalize';
import type { CardData } from '../domain/types';

const DEFAULT_SEARCH_LIMIT = 30;

/** 正規化済みの名前と読みを持つ検索対象。 */
export interface CardSearchEntry {
  card: CardData;
  name: string;
  kana: string;
}

/** 名前と読みを検索し、前方一致を優先して返す。 */
export function searchCards(
  index: readonly CardSearchEntry[], query: string, limit = DEFAULT_SEARCH_LIMIT,
): CardData[] {
  const normalized = normalizeForMatch(query);
  if (!normalized || limit <= 0) return [];
  const prefix: CardData[] = [];
  const partial: CardData[] = [];
  for (const entry of index) {
    const isPrefix = entry.name.startsWith(normalized) || entry.kana.startsWith(normalized);
    if (isPrefix) prefix.push(entry.card);
    else if (entry.name.includes(normalized) || entry.kana.includes(normalized)) {
      partial.push(entry.card);
    }
  }
  const compare = (left: CardData, right: CardData) =>
    left.name.length - right.name.length || left.name.localeCompare(right.name, 'ja');
  prefix.sort(compare);
  partial.sort(compare);
  return prefix.concat(partial).slice(0, limit);
}
