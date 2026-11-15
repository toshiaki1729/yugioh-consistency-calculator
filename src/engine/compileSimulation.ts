import { isInGroup } from '../domain/filter';
import type { CardData, CardId, CardTarget, Deck, Pattern } from '../domain/types';
import type { SimulationInput, SimulationStep } from './simulateTypes';

/** メインデッキのカード番号に、スロット・条件・効果の対象を解決する。 */
export function compileSimulation(
  deck: Deck, counts: Map<CardId, number>, active: Pattern[],
  resolveCard: (id: CardId) => CardData | undefined,
): Pick<SimulationInput, 'cards' | 'patterns' | 'effects'> {
  // 有効パターンを切り替えてもカード番号とシャッフルの乱数列を保つ。
  const cards = Array.from(counts, ([key, count]) => ({ key, count }));
  const indices = new Map(cards.map((card, index) => [card.key, index]));
  const groups = new Map(deck.groups.map(group => [group.id, group]));
  const cardData = cards.map(card => resolveCard(card.key));
  function resolveMembers(target: CardTarget): number[] {
    if (target.type === 'card') {
      const index = indices.get(target.cardId);
      return index === undefined ? [] : [index];
    }
    const group = groups.get(target.groupId);
    if (!group) return [];
    return cards.flatMap((card, index) =>
      isInGroup(group, card.key, cardData[index]) ? [index] : []);
  }
  const patterns = active.map(pattern => ({
    id: pattern.id,
    slots: pattern.slots.map(slot => ({
      count: slot.count, distinct: slot.distinctNames, members: resolveMembers(slot.source),
    })),
    conditions: pattern.conditions.map(({ target, ...condition }) => ({
      ...condition, members: resolveMembers(target),
    })),
  }));
  const effects = deck.effects.filter(effect => (counts.get(effect.cardId) ?? 0) > 0)
    .map(effect => ({
      card: indices.get(effect.cardId)!, oncePerTurn: effect.oncePerTurn,
      firstOnly: effect.firstOnly, drawLock: effect.drawLock,
      steps: effect.steps.map((step): SimulationStep => {
        if (step.kind === 'draw' || step.kind === 'banishTop') return { ...step };
        if (step.kind === 'excavate') {
          return { kind: step.kind, count: step.count,
            members: step.target === null ? null : resolveMembers(step.target) };
        }
        const { target, ...operation } = step;
        return { ...operation, members: resolveMembers(target) };
      }),
    }));
  return { cards, patterns, effects };
}
