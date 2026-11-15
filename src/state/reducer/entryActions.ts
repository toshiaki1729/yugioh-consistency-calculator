import type { Deck, DeckEntry } from '../../domain/types';
import { MIN_ENTRY_COUNT, MAX_ENTRY_COUNT } from '../../domain/limits';
import type { ActionOf } from './types';

/** 追加・移動・取り込みの同一カードを区分ごとに合算する。 */
export function mergeEntries(deck: Deck): string | undefined {
  const merged = new Map<string, DeckEntry>();
  for (const entry of deck.entries) {
    if (!Number.isInteger(entry.count)
      || entry.count < MIN_ENTRY_COUNT || entry.count > MAX_ENTRY_COUNT) {
      const location = `デッキ「${deck.name}」のカード「${entry.name}」`;
      return `${location}: 枚数は ${MIN_ENTRY_COUNT}〜${MAX_ENTRY_COUNT} の整数で指定してください。`;
    }
    const key = JSON.stringify([entry.cardId, entry.section]);
    const existing = merged.get(key);
    if (existing) existing.count += entry.count;
    else merged.set(key, { ...entry });
  }
  deck.entries = [...merged.values()];
}

/** 指定区分にカードを追加し、既存の枚数と合算する。 */
export function addEntry(deck: Deck, action: ActionOf<'entry/add'>): string | undefined {
  deck.entries.push({
    cardId: action.cardId, name: action.name, section: action.section,
    count: action.count ?? MIN_ENTRY_COUNT,
  });
  return mergeEntries(deck);
}

function findEntry(deck: Deck, action: { cardId: string; section: DeckEntry['section'] }) {
  return deck.entries.find(item =>
    item.cardId === action.cardId && item.section === action.section);
}

/** カードの枚数を変更し、0 枚なら削除する。 */
export function setEntryCount(deck: Deck, action: ActionOf<'entry/setCount'>): string | undefined {
  const entry = findEntry(deck, action);
  if (!entry) return '対象のカードがデッキにありません。';
  if (action.count === 0) deck.entries = deck.entries.filter(item => item !== entry);
  else entry.count = action.count;
}

/** 指定区分からカードを削除する。 */
export function deleteEntry(deck: Deck, action: ActionOf<'entry/delete'>): string | undefined {
  const entry = findEntry(deck, action);
  if (!entry) return '対象のカードがデッキにありません。';
  deck.entries = deck.entries.filter(item => item !== entry);
}

/** カードを別区分に移し、移動先の枚数と合算する。 */
export function setEntrySection(
  deck: Deck, action: ActionOf<'entry/setSection'>,
): string | undefined {
  const entry = findEntry(deck, action);
  if (!entry) return '対象のカードがデッキにありません。';
  entry.section = action.newSection;
  return mergeEntries(deck);
}
