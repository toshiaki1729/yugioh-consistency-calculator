import { expect, it } from 'vitest';
import { compile } from '../src/engine/compile';
import { runEngine } from '../src/engine/run';
import { perfCards, perfDeck } from './fixtures/perfDeck';

it('固定の40枚・20パターンを3回計測し中央値が2000ms以下', () => {
  const cards = new Map(perfCards.map(card => [card.id, card]));
  const times: number[] = [];
  expect(perfDeck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(40);
  expect(perfDeck.patterns).toHaveLength(20);
  for (let trial = 0; trial < 3; trial++) {
    const start = performance.now();
    const compiled = compile(perfDeck, id => cards.get(id), [5, 6]);
    if (!compiled.ok) throw new Error(compiled.error);
    const results = runEngine(compiled.value);
    times.push(performance.now() - start);
    expect(results.map(result => result.handSize)).toEqual([5, 6]);
    for (const result of results) {
      expect(result.success.method).toBe('exact');
      expect(Object.keys(result.perPattern)).toHaveLength(20);
      expect(Object.values(result.perPattern).every(estimate => estimate.method === 'exact')).toBe(true);
    }
  }
  const median = [...times].sort((a, b) => a - b)[1];
  console.log(`エンジン性能: ${times.map(time => time.toFixed(2)).join(', ')} ms / 中央値 ${median.toFixed(2)} ms`);
  expect(median).toBeLessThanOrEqual(2000);
}, 15_000);
