import { expect, it } from 'vitest';
import { runSimulation } from '../src/engine/simulateRun';
import { simulationPerfInput } from './fixtures/simulationPerfDeck';

it('固定の40枚・10パターンを手札5枚・6枚で各20万回計測する', () => {
  const input = simulationPerfInput;
  expect(input.cards.reduce((sum, card) => sum + card.count, 0)).toBe(40);
  expect(input.patterns).toHaveLength(10);
  expect(input.patterns.filter(pattern => pattern.conditions.length > 0)).toHaveLength(2);
  expect(input.limits.samples).toBe(200_000);
  const times: number[] = [];
  for (const handSize of input.handSizes) {
    const start = performance.now();
    const result = runSimulation(input, handSize);
    const elapsed = performance.now() - start;
    times.push(elapsed);
    console.log(`シミュレーション性能: 手札${handSize}枚・200000回 ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThanOrEqual(60_000);
    expect(Object.keys(result.perPattern)).toHaveLength(10);
    for (const estimate of [result.success, ...Object.values(result.perPattern)]) {
      expect(estimate).toMatchObject({ method: 'simulation', samples: 200_000 });
      expect(estimate.p).toBeGreaterThanOrEqual(0);
      expect(estimate.p).toBeLessThanOrEqual(1);
      expect(estimate.lo).toBeLessThanOrEqual(estimate.p);
      expect(estimate.hi).toBeGreaterThanOrEqual(estimate.p);
    }
  }
  console.log(`シミュレーション性能: 合計 ${times.reduce((sum, time) => sum + time, 0).toFixed(2)} ms`);
}, 125_000);
