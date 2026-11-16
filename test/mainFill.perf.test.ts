import { expect, it } from 'vitest';
import { compile } from '../src/engine/compile';
import { runEngine } from '../src/engine/run';
import { perfCards, perfDeck } from './fixtures/perfDeck';
import { distinctNamesPerfCards, distinctNamesPerfDeck } from './fixtures/distinctNamesPerfDeck';

it.each([
  ['既存20パターン', perfDeck, perfCards],
  ['同名10パターン', distinctNamesPerfDeck, distinctNamesPerfCards],
] as const)('%s の固定40枚を60枚まで補って3回計測する', (label, deck, cards) => {
  const lookup = new Map(cards.map(card => [card.id, card]));
  const times: number[] = [];
  expect(deck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(40);
  for (let trial = 0; trial < 3; trial++) {
    const start = performance.now();
    const compiled = compile({ ...deck, mainFillTarget: 60 }, id => lookup.get(id), [5, 6]);
    if (!compiled.ok) throw new Error(compiled.error);
    expect(compiled.value.deckSize).toBe(60);
    const results = runEngine(compiled.value);
    times.push(performance.now() - start);
    expect(results.map(result => result.handSize)).toEqual([5, 6]);
    expect(results.every(result => result.success.method === 'exact')).toBe(true);
  }
  const median = [...times].sort((a, b) => a - b)[1];
  console.log(`60枚補充性能（${label}）: ${times.map(time => time.toFixed(2)).join(', ')} ms / 中央値 ${median.toFixed(2)} ms`);
}, 30_000);
