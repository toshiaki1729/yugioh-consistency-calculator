import { normalizeForMatch } from '../domain/normalize';
import type { CardData } from '../domain/types';

export interface CardSearchEntry {
  card: CardData;
  name: string;
  kana: string;
}

export function searchCards(index: readonly CardSearchEntry[], query: string, limit = 30): CardData[] {
  const normalized = normalizeForMatch(query);
  if (!normalized || limit <= 0) return [];
  const prefix: CardData[] = [];
  const partial: CardData[] = [];
  for (const entry of index) {
    if (entry.name.startsWith(normalized) || entry.kana.startsWith(normalized)) prefix.push(entry.card);
    else if (entry.name.includes(normalized) || entry.kana.includes(normalized)) partial.push(entry.card);
  }
  const compare = (a: CardData, b: CardData) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'ja');
  prefix.sort(compare);
  partial.sort(compare);
  return prefix.concat(partial).slice(0, limit);
}
