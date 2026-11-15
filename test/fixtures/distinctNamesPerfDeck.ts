import type { CardData, CardGroup, Deck, Pattern, Slot } from '../../src/domain/types';

export const distinctNamesPerfCards: CardData[] = Array.from({ length: 16 }, (_, i) => ({
  id: `k${i + 1}`, name: `性能カード${i + 1}`, kind: 'monster', monsterTypes: ['effect'],
  text: i === 1 ? 'このカード名はルール上「性能カード1」として扱う。' : '',
}));

const groups: CardGroup[] = Array.from({ length: 5 }, (_, i) => ({
  id: `G${i}`, name: `G${i}`, filter: { op: 'or', children: [] },
  include: ['k1', 'k2', ...distinctNamesPerfCards.slice(2 + i * 2, 6 + i * 2).map(card => card.id)],
  exclude: [],
}));

const patterns: Pattern[] = Array.from({ length: 10 }, (_, i) => {
  const slots: Slot[] = [{
    id: `P${i}:0`, source: { type: 'group', groupId: `G${i % 5}` },
    count: 2, distinctNames: true,
  }];
  if (i >= 5) slots.push({
    id: `P${i}:1`, source: { type: 'group', groupId: `G${(i + 1) % 5}` },
    count: 2, distinctNames: i % 2 === 0,
  });
  return { id: `P${i}`, name: `P${i}`, enabled: true, slots, conditions: [] };
});

export const distinctNamesPerfDeck: Deck = {
  id: 'distinct-perf', name: '同名カードの性能測定',
  entries: distinctNamesPerfCards.map((card, i) => ({
    cardId: card.id, name: card.name,
    count: i === 15 ? 8 : i === 0 || i === 2 ? 3 : 2, section: 'main',
  })),
  groups, patterns, effects: [], customCards: [], pageData: {}, updatedAt: 0,
};
