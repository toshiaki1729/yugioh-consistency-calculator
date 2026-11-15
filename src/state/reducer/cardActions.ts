import type { Deck, FilterNode } from '../../domain/types';
import type { ActionOf } from './types';
import { hasEffectTarget, isSameTarget } from './targetReferences';

/** カスタムカードを採番して登録し、指定時はデッキにも同時追加する。 */
export function addCustomCard(
  deck: Deck, action: ActionOf<'customCard/add'>, newId: () => string,
): void {
  const card = { ...action.card, id: `c:${newId()}`, custom: true };
  deck.customCards.push(card);
  if (action.addToDeck) {
    deck.entries.push({ cardId: card.id, name: card.name, ...action.addToDeck });
  }
}

/** カスタムカードの属性とデッキ内の表示名を更新する。 */
export function editCustomCard(
  deck: Deck, action: ActionOf<'customCard/edit'>,
): string | undefined {
  const card = deck.customCards.find(item => item.id === action.cardId);
  if (!card) return '対象のカスタムカードがありません。';
  Object.assign(card, action.changes);
  for (const entry of deck.entries) if (entry.cardId === card.id) entry.name = card.name;
}

function removeFilterCard(node: FilterNode, cardId: string): void {
  if (node.op === 'pred') {
    if (node.pred.kind === 'cards') {
      node.pred.cardIds = node.pred.cardIds.filter(id => id !== cardId);
    }
  } else if (node.op === 'not') removeFilterCard(node.child, cardId);
  else node.children.forEach(child => removeFilterCard(child, cardId));
}

/** カスタムカードと、デッキ内の条件・スロットからの参照を削除する。 */
export function deleteCustomCard(
  deck: Deck, action: ActionOf<'customCard/delete'>,
): string | undefined {
  const cardId = action.cardId;
  const target = { type: 'card', cardId } as const;
  if (!deck.customCards.some(card => card.id === cardId)) {
    return '対象のカスタムカードがありません。';
  }
  deck.customCards = deck.customCards.filter(card => card.id !== cardId);
  deck.entries = deck.entries.filter(entry => entry.cardId !== cardId);
  for (const group of deck.groups) {
    group.include = group.include.filter(id => id !== cardId);
    group.exclude = group.exclude.filter(id => id !== cardId);
    removeFilterCard(group.filter, cardId);
  }
  for (const pattern of deck.patterns) {
    pattern.slots = pattern.slots.filter(slot => !isSameTarget(slot.source, target));
    pattern.conditions = pattern.conditions.filter(condition =>
      !isSameTarget(condition.target, target));
  }
  deck.effects = deck.effects.filter(effect =>
    effect.cardId !== cardId && !hasEffectTarget(effect, target));
}

/** 公式ページから得た補助データを更新する。 */
export function updatePageData(deck: Deck, action: ActionOf<'pageData/update'>): void {
  deck.pageData = { ...deck.pageData, ...action.pageData };
}
