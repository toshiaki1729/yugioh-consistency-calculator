import { expect, it } from 'vitest';
import { compile } from '../src/engine/compile';
import { runEngine } from '../src/engine/run';
import { distinctNamesPerfCards, distinctNamesPerfDeck } from './fixtures/distinctNamesPerfDeck';

it('同名カードを含む40枚・10パターンの厳密計算を3回測定する', () => {
  const cards = new Map(distinctNamesPerfCards.map(card => [card.id, card]));
  const times: number[] = [];
  expect(distinctNamesPerfDeck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(40);
  expect(distinctNamesPerfDeck.patterns).toHaveLength(10);
  for (let trial = 0; trial < 3; trial++) {
    const start = performance.now();
    const compiled = compile(distinctNamesPerfDeck, id => cards.get(id), [5, 6]);
    if (!compiled.ok) throw new Error(compiled.error);
    const results = runEngine(compiled.value);
    times.push(performance.now() - start);
    expect(results.map(result => result.handSize)).toEqual([5, 6]);
    for (const result of results) {
      expect(result.success.method).toBe('exact');
      expect(Object.keys(result.perPattern)).toHaveLength(10);
      expect(Object.values(result.perPattern).every(estimate => estimate.method === 'exact')).toBe(true);
    }
  }
  const median = [...times].sort((a, b) => a - b)[1];
  console.log(`同名カード性能: ${times.map(time => time.toFixed(2)).join(', ')} ms / 中央値 ${median.toFixed(2)} ms`);
  expect(median).toBeLessThanOrEqual(2000);
}, 15_000);
