import type { Deck } from '../../domain/types';
import type { ActionOf } from './types';
import { createCopyName } from './factories';

/** スロットが空の有効なパターンを作る。 */
export function createPattern(
  deck: Deck, action: ActionOf<'pattern/create'>, newId: () => string,
): void {
  deck.patterns.push({ id: newId(), name: action.name ?? '新しいパターン', enabled: true, slots: [] });
}

/** パターンと各スロットを別 ID で複製する。 */
export function duplicatePattern(
  deck: Deck, action: ActionOf<'pattern/duplicate'>, newId: () => string,
): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  deck.patterns.push({
    ...structuredClone(pattern), id: newId(), name: createCopyName(pattern.name),
    slots: pattern.slots.map(slot => ({ ...structuredClone(slot), id: newId() })),
  });
}

/** 指定したパターンを削除する。 */
export function deletePattern(deck: Deck, action: ActionOf<'pattern/delete'>): void {
  deck.patterns = deck.patterns.filter(pattern => pattern.id !== action.patternId);
}

/** 全 ID の過不足と重複を確認してパターンを並べ替える。 */
export function reorderPatterns(
  deck: Deck, action: ActionOf<'pattern/reorder'>,
): string | undefined {
  const patterns = new Map(deck.patterns.map(pattern => [pattern.id, pattern]));
  const hasAllPatterns = action.patternIds.length === patterns.size
    && new Set(action.patternIds).size === patterns.size
    && action.patternIds.every(id => patterns.has(id));
  if (!hasAllPatterns) {
    return '並べ替えには、すべてのパターン ID を重複なく指定してください。';
  }
  deck.patterns = action.patternIds.map(id => patterns.get(id)!);
}

/** パターンの名前や有効状態を編集する。 */
export function editPattern(deck: Deck, action: ActionOf<'pattern/edit'>): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  Object.assign(pattern, action.changes);
}

/** パターンの有効状態を切り替える。 */
export function togglePattern(deck: Deck, action: ActionOf<'pattern/toggle'>): string | undefined {
  const pattern = deck.patterns.find(item => item.id === action.patternId);
  if (!pattern) return '対象のパターンがありません。';
  pattern.enabled = !pattern.enabled;
}
