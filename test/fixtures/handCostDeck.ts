import { createCalculationDeck, createCalculationEffect } from './calculationDeck';

export function createHandCostDeck() {
  const deck = createCalculationDeck([3, 4, 1, 32]);
  deck.groups.push({
    id: 'dark', name: '闇属性', include: ['k2'], exclude: [],
    filter: { op: 'or', children: [] },
  });
  deck.effects = [{
    ...createCalculationEffect([
      { kind: 'draw', count: 2 },
      { kind: 'handCost', target: { type: 'group', groupId: 'dark' }, destination: 'banishedFaceUp' },
    ]),
    cardId: 'k3',
  }];
  return deck;
}
