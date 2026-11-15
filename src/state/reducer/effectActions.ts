import type { Deck } from '../../domain/types';
import type { ActionOf } from './types';

/** ドロー効果を採番し、優先順の末尾に追加する。 */
export function addEffect(deck: Deck, action: ActionOf<'effect/add'>, newId: () => string): void {
  deck.effects.push({ ...action.effect, id: newId() });
}

/** ドロー効果のカード・制約・手順を編集する。 */
export function editEffect(deck: Deck, action: ActionOf<'effect/edit'>): string | undefined {
  const effect = deck.effects.find(item => item.id === action.effectId);
  if (!effect) return '対象のドロー効果がありません。';
  Object.assign(effect, action.changes);
}

/** 指定したドロー効果を削除する。 */
export function deleteEffect(deck: Deck, action: ActionOf<'effect/delete'>): string | undefined {
  const effect = deck.effects.find(item => item.id === action.effectId);
  if (!effect) return '対象のドロー効果がありません。';
  deck.effects = deck.effects.filter(item => item !== effect);
}

/** 全 ID の過不足と重複を確認してドロー効果の優先順を変更する。 */
export function reorderEffects(deck: Deck, action: ActionOf<'effect/reorder'>): string | undefined {
  const effects = new Map(deck.effects.map(effect => [effect.id, effect]));
  const hasAllEffects = action.effectIds.length === effects.size
    && new Set(action.effectIds).size === effects.size
    && action.effectIds.every(id => effects.has(id));
  if (!hasAllEffects) {
    return '並べ替えには、すべてのドロー効果 ID を重複なく指定してください。';
  }
  deck.effects = action.effectIds.map(id => effects.get(id)!);
}
