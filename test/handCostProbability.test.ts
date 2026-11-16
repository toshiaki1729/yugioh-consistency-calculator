import { expect, it } from 'vitest';
import { runCalculation } from '../src/engine/run';
import { compileCalculationDeck } from './fixtures/calculationDeck';
import { createHandCostDeck } from './fixtures/handCostDeck';

// エンジンの組み合わせ計算を使わず、初手と次の2枚を独立に数え上げる。
function choose(total: number, count: number): number {
  if (count < 0 || count > total) return 0;
  let result = 1;
  for (let i = 1; i <= count; i++) result = result * (total - i + 1) / i;
  return result;
}
function expectedProbability(handSize: number, canUseWithoutTarget: boolean) {
  let probability = 1 - choose(37, handSize) / choose(40, handSize);
  for (let darkInHand = 0; darkInHand <= 4; darkInHand++) {
    if (!canUseWithoutTarget && darkInHand === 0) continue;
    const handProbability = choose(4, darkInHand) * choose(32, handSize - 1 - darkInHand)
      / choose(40, handSize);
    for (let startersDrawn = 1; startersDrawn <= 2; startersDrawn++) {
      for (let darkDrawn = 0; darkDrawn <= 2 - startersDrawn; darkDrawn++) {
        if (darkInHand + darkDrawn === 0) continue;
        const otherRemaining = 32 - (handSize - 1 - darkInHand);
        const drawProbability = choose(3, startersDrawn) * choose(4 - darkInHand, darkDrawn)
          * choose(otherRemaining, 2 - startersDrawn - darkDrawn) / choose(40 - handSize, 2);
        probability += handProbability * drawProbability;
      }
    }
  }
  return probability;
}

it('20万回の結果と設定による差が、初手とドローの組み合わせから計算した値に一致する', () => {
  const deck = createHandCostDeck();
  const without = runCalculation(compileCalculationDeck(deck, [5, 6], { seed: 3716 }));
  const step = deck.effects[0].steps[1];
  if (step.kind !== 'handCost') throw new Error('手放す手順が必要');
  step.whenMissing = 'graveyard';
  const withMissing = runCalculation(compileCalculationDeck(deck, [5, 6], { seed: 3716 }));
  for (let i = 0; i < without.length; i++) {
    const handSize = without[i].handSize;
    const expectedWithout = expectedProbability(handSize, false);
    const expectedWith = expectedProbability(handSize, true);
    for (const [result, expected] of [[without[i], expectedWithout], [withMissing[i], expectedWith]] as const) {
      for (const estimate of [result.success, result.perPattern.P]) {
        expect(estimate.samples).toBe(200_000);
        expect(estimate.method).toBe('simulation');
        expect(Math.abs(estimate.p - expected)).toBeLessThanOrEqual(0.01);
      }
    }
    const difference = withMissing[i].success.p - without[i].success.p;
    const expectedDifference = expectedWith - expectedWithout;
    expect(Math.abs(difference - expectedDifference)).toBeLessThanOrEqual(0.0005);
    console.log(JSON.stringify({ handSize, expectedWithout, expectedWith,
      without: without[i].success.p, withMissing: withMissing[i].success.p,
      difference, expectedDifference }));
  }
});
