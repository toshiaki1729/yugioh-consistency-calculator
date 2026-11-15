import type { CardData, CardGroup, Deck, Pattern, Slot } from '../../src/domain/types';

export const nameCards: CardData[] = ['A', 'W', 'B', 'C', 'O', 'E'].map(id => ({
  id, name: id, kind: 'monster', monsterTypes: ['effect'],
  text: id === 'W' ? 'このカード名はルール上「A」として扱う。' : '',
}));

export function nameSlot(groupId: string, count = 2, distinctNames = true): Slot {
  return { id: groupId, source: { type: 'group', groupId }, count, distinctNames };
}

export function namePattern(id: string, slots: Slot[]): Pattern {
  return { id, name: id, enabled: true, slots, conditions: [] };
}

export function nameGroup(id: string, include: string[]): CardGroup {
  return { id, name: id, filter: { op: 'or', children: [] }, include, exclude: [] };
}

export function makeNameDeck(counts: Record<string, number> = { A: 3, W: 3, B: 3, O: 31 }): Deck {
  return {
    id: 'names', name: '名前の判定', updatedAt: 0, effects: [], customCards: [], pageData: {},
    entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, name: cardId, count, section: 'main' })),
    groups: [nameGroup('AWB', ['A', 'W', 'B'])],
    patterns: [namePattern('P', [nameSlot('AWB')])],
  };
}

// 名前はテスト側で指定し、エンジンのクラス分け・名前抽出・最大流を使わない。
export function enumerateNameHands(deck: Deck, handSize: number, names: Record<string, string>) {
  const physical = deck.entries.filter(entry => entry.section === 'main')
    .flatMap(entry => Array<string>(entry.count).fill(entry.cardId));
  const belongs = (id: string, source: Slot['source']) => source.type === 'card'
    ? id === source.cardId : deck.groups.find(group => group.id === source.groupId)!.include.includes(id);
  function matches(hand: string[], pattern: Pattern) {
    for (const condition of pattern.conditions) {
      if (condition.kind !== 'deckAtLeast') throw new Error('参照実装は残数条件だけを扱う');
      const total = physical.filter(id => belongs(id, condition.target)).length;
      const drawn = hand.filter(id => belongs(id, condition.target)).length;
      if (total - drawn < condition.count) return false;
    }
    const used = new Set<number>();
    function assignSlot(slotIndex: number): boolean {
      if (slotIndex === pattern.slots.length) return true;
      const slot = pattern.slots[slotIndex];
      const usedNames = new Set<string>();
      function assignCard(remaining: number, start: number): boolean {
        if (remaining === 0) return assignSlot(slotIndex + 1);
        for (let i = start; i < hand.length; i++) {
          const name = names[hand[i]];
          if (used.has(i) || !belongs(hand[i], slot.source)) continue;
          if (slot.distinctNames && usedNames.has(name)) continue;
          used.add(i);
          if (slot.distinctNames) usedNames.add(name);
          if (assignCard(remaining - 1, i + 1)) return true;
          used.delete(i);
          if (slot.distinctNames) usedNames.delete(name);
        }
        return false;
      }
      return assignCard(slot.count, 0);
    }
    return assignSlot(0);
  }
  let total = 0;
  let successes = 0;
  const perPattern = Object.fromEntries(deck.patterns.map(pattern => [pattern.id, 0]));
  const hand: string[] = [];
  function enumerate(start: number) {
    if (hand.length === handSize) {
      total++;
      let hasSuccess = false;
      for (const pattern of deck.patterns) {
        if (!matches(hand, pattern)) continue;
        hasSuccess = true;
        perPattern[pattern.id]++;
      }
      if (hasSuccess) successes++;
      return;
    }
    for (let i = start; i <= physical.length - (handSize - hand.length); i++) {
      hand.push(physical[i]);
      enumerate(i + 1);
      hand.pop();
    }
  }
  enumerate(0);
  return { total, p: successes / total, perPattern: Object.fromEntries(
    Object.entries(perPattern).map(([id, count]) => [id, count / total]),
  ) };
}
