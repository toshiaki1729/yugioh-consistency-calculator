import type { Deck } from '../../domain/types';
import type { ActionOf } from './types';

/** 指定パターンに採番したスロットを追加する。 */
export function addSlot(
  deck: Deck, action: ActionOf<'slot/add'>, newId: () => string,
): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  pattern.slots.push({ ...action.slot, id: newId() });
}

/** スロットの対象・必要枚数・種類違いの指定を編集する。 */
export function editSlot(deck: Deck, action: ActionOf<'slot/edit'>): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  const slot = pattern.slots.find(item => item.id === action.slotId);
  if (!slot) return '対象のスロットがありません。';
  Object.assign(slot, action.changes);
}

/** 指定パターンからスロットを削除する。 */
export function deleteSlot(deck: Deck, action: ActionOf<'slot/delete'>): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  const slot = pattern.slots.find(item => item.id === action.slotId);
  if (!slot) return '対象のスロットがありません。';
  pattern.slots = pattern.slots.filter(item => item !== slot);
}
