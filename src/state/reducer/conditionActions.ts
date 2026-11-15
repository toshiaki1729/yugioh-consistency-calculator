import type { Deck } from '../../domain/types';
import type { ActionOf } from './types';

/** 指定パターンに追加の条件を加える。 */
export function addCondition(deck: Deck, action: ActionOf<'condition/add'>): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  pattern.conditions.push(action.condition);
}

/** 指定位置の追加の条件を置き換える。 */
export function editCondition(deck: Deck, action: ActionOf<'condition/edit'>): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  if (!Number.isInteger(action.index) || action.index < 0
    || action.index >= pattern.conditions.length) return '対象の条件がありません。';
  pattern.conditions[action.index] = action.condition;
}

/** 指定位置の追加の条件を削除する。 */
export function deleteCondition(
  deck: Deck, action: ActionOf<'condition/delete'>,
): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  if (!Number.isInteger(action.index) || action.index < 0
    || action.index >= pattern.conditions.length) return '対象の条件がありません。';
  pattern.conditions.splice(action.index, 1);
}
