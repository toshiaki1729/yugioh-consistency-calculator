import type { Deck } from '../../domain/types';
import type { ActionOf } from './types';
import { createCopyName } from './factories';
import { hasEffectTarget, isSameTarget } from './targetReferences';

/** すべての取得済みカードに一致するグループを作る。 */
export function createGroup(
  deck: Deck, action: ActionOf<'group/create'>, newId: () => string,
): void {
  deck.groups.push({
    id: newId(), name: action.name ?? '新しいグループ',
    filter: { op: 'and', children: [] }, include: [], exclude: [],
  });
}

/** 条件と手動設定を保ってグループを複製する。 */
export function duplicateGroup(
  deck: Deck, action: ActionOf<'group/duplicate'>, newId: () => string,
): string | undefined {
  const group = deck.groups.find(item => item.id === action.groupId);
  if (!group) return '対象のグループがありません。';
  deck.groups.push({ ...structuredClone(group), id: newId(), name: createCopyName(group.name) });
}

/** グループの名前・条件・手動設定を編集する。 */
export function editGroup(deck: Deck, action: ActionOf<'group/edit'>): string | undefined {
  const group = deck.groups.find(item => item.id === action.groupId);
  if (!group) return '対象のグループがありません。';
  Object.assign(group, action.changes);
}

/** グループと、それを参照するスロット・追加の条件・ドロー効果を削除する。 */
export function deleteGroup(deck: Deck, action: ActionOf<'group/delete'>): void {
  const target = { type: 'group', groupId: action.groupId } as const;
  deck.groups = deck.groups.filter(group => group.id !== action.groupId);
  for (const pattern of deck.patterns) {
    pattern.slots = pattern.slots.filter(slot => !isSameTarget(slot.source, target));
    pattern.conditions = pattern.conditions.filter(condition =>
      !isSameTarget(condition.target, target));
  }
  deck.effects = deck.effects.filter(effect => !hasEffectTarget(effect, target));
}
