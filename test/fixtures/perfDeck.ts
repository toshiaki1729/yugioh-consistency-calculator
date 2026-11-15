import type { CardData, CardGroup, Deck, Pattern, Slot } from '../../src/domain/types';

export const perfCards: CardData[] = Array.from({ length: 25 }, (_, i) => ({
  id: `C${i + 1}`, name: `C${i + 1}`, kind: 'monster', monsterTypes: ['effect'], text: '',
}));

const groupMembers = [
  perfCards.slice(0, 10), perfCards.slice(5, 15), perfCards.slice(10, 25),
  perfCards.filter((_, i) => i % 2 === 0),
];
const groups: CardGroup[] = groupMembers.map((cards, i) => ({
  id: `G${i + 1}`, name: `G${i + 1}`,
  filter: { op: 'pred', pred: { kind: 'cards', cardIds: cards.map(card => card.id) } },
  include: [], exclude: [],
}));

const cardSlot = (i: number): Slot => ({
  id: '', source: { type: 'card', cardId: `C${i}` }, count: 1, distinctNames: false,
});
const groupSlot = (i: number, count = 1, distinctNames = false): Slot => ({
  id: '', source: { type: 'group', groupId: `G${i}` }, count, distinctNames,
});
const patternSlots: Slot[][] = [
  ...Array.from({ length: 10 }, (_, i) => [cardSlot(i + 1)]),
  ...Array.from({ length: 4 }, (_, i) => [cardSlot(i + 1), groupSlot(3)]),
  [groupSlot(1), groupSlot(2)],
  [groupSlot(2, 2, true)],
  [groupSlot(4), cardSlot(5)],
  [groupSlot(1), groupSlot(4)],
  [cardSlot(1), groupSlot(2), groupSlot(3)],
  [groupSlot(3, 3, true)],
];
const patterns: Pattern[] = patternSlots.map((slots, i) => ({
  id: `P${i + 1}`, name: `P${i + 1}`, enabled: true,
  slots: slots.map((slot, j) => ({ ...slot, id: `P${i + 1}:S${j + 1}` })), conditions: [],
}));

export const perfDeck: Deck = {
  id: 'perf', name: '性能測定',
  entries: perfCards.map((card, i) => ({
    cardId: card.id, name: card.name, count: i < 5 ? 3 : i < 10 ? 2 : 1, section: 'main',
  })),
  groups, patterns, effects: [], customCards: [], pageData: {}, updatedAt: 0,
};
