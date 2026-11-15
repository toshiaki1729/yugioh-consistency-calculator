import { isInGroup } from '../domain/filter';
import type { CardData, CardId, Deck, Pattern, Slot } from '../domain/types';
import type { EngineInput } from './types';

/** ドロー効果・上からの除外を使わない有効パターンをクラスに集約する。 */
export function compileClassPatterns(
  deck: Deck, counts: Map<CardId, number>, active: Pattern[],
  resolveCard: (id: CardId) => CardData | undefined,
) {
  const impossiblePatternIds = active.filter(pattern =>
    pattern.conditions.some(condition => condition.kind === 'movedIncludes'))
    .map(pattern => pattern.id);
  const possible = active.filter(pattern => !impossiblePatternIds.includes(pattern.id));
  const remaining = possible.map(pattern =>
    pattern.conditions.filter(condition => condition.kind === 'deckAtLeast'));
  const slots = possible.flatMap(pattern => pattern.slots);
  const targets = [...slots, ...remaining.flat().map(condition => ({
    source: condition.target, distinctNames: false,
  }))];
  const { classes, otherCount, members } = collectClasses(
    deck, counts, targets, slots.length, resolveCard,
  );
  let slotIndex = 0;
  let conditionIndex = slots.length;
  const patterns = possible.map((pattern, i) => ({
    id: pattern.id,
    slots: pattern.slots.map(slot => ({
      count: slot.count, distinct: slot.distinctNames, members: members[slotIndex++],
    })),
    conditions: remaining[i].map(condition => ({
      minRemaining: condition.count, members: members[conditionIndex++],
    })),
  }));
  if (impossiblePatternIds.length > 0) {
    return { classes, otherCount, patterns, impossiblePatternIds };
  }
  return { classes, otherCount, patterns };
}

function collectClasses(
  deck: Deck, counts: Map<CardId, number>, targets: Pick<Slot, 'source' | 'distinctNames'>[],
  slotCount: number, resolveCard: (id: CardId) => CardData | undefined,
) {
  const groups = new Map(deck.groups.map(group => [group.id, group]));
  const members = targets.map(() => [] as number[]);
  const classes: EngineInput['classes'] = [];
  const classIndices = new Map<string, number>();
  let otherCount = 0;
  for (const [cardId, count] of counts) {
    const card = resolveCard(cardId);
    const membership: number[] = [];
    let hasDistinctSlot = false;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const group = target.source.type === 'group' ? groups.get(target.source.groupId) : undefined;
      const isMatch = target.source.type === 'card'
        ? target.source.cardId === cardId
        : group !== undefined && isInGroup(group, cardId, card);
      if (isMatch) {
        membership.push(i);
        hasDistinctSlot ||= target.distinctNames;
      }
    }
    if (membership.length === 0) {
      otherCount += count;
      continue;
    }
    const slotMembership = membership.filter(index => index < slotCount);
    const conditionMembership = membership.filter(index => index >= slotCount)
      .map(index => index - slotCount);
    let key = `slots:${slotMembership.join(',')}`;
    if (conditionMembership.length > 0) key += `|conds:${conditionMembership.join(',')}`;
    if (hasDistinctSlot) key = `card:${cardId}`;
    const existing = classIndices.get(key);
    if (existing !== undefined) {
      classes[existing].count += count;
    } else {
      const index = classes.length;
      classIndices.set(key, index);
      classes.push({ key, count });
      for (const targetIndex of membership) members[targetIndex].push(index);
    }
  }
  return { classes, otherCount, members };
}
