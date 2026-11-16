import { expect, it } from 'vitest';
import { runCalculation } from '../src/engine/run';
import { compileCalculationDeck } from './fixtures/calculationDeck';
import { createHandCostDeck } from './fixtures/handCostDeck';

// T37 の実装変更前に Vite の ssrLoadModule で取得した入力と結果。
it('whenMissing の無い入力と固定シードの結果は変更前と完全一致する', () => {
  const calculation = compileCalculationDeck(createHandCostDeck(), [5, 6], {
    samples: 20_000, seed: 3716,
  });
  expect(calculation).toStrictEqual({
    mode: 'simulation',
    input: {
      cards: [
        { key: 'k1', count: 3 }, { key: 'k2', count: 4 },
        { key: 'k3', count: 1 }, { key: 'k4', count: 32 },
      ],
      patterns: [{ id: 'P', slots: [{ count: 1, distinct: false, members: [0] }], conditions: [] }],
      effects: [{
        card: 2, oncePerTurn: false, firstOnly: false, drawLock: 'none',
        steps: [
          { kind: 'draw', count: 2 },
          { kind: 'handCost', destination: 'banishedFaceUp', members: [1] },
        ],
      }],
      handSizes: [5, 6],
      limits: { exactMaxStates: 2_000_000, samples: 20_000, seed: 3716 },
    },
  });
  if (calculation.mode !== 'simulation') throw new Error('シミュレーション入力が必要');
  expect(Object.hasOwn(calculation.input.effects[0].steps[1], 'whenMissing')).toBe(false);
  const results = runCalculation(calculation).map(({ elapsedMs: _, ...result }) => result);
  expect(results).toStrictEqual([
    {
      handSize: 5,
      success: {
        p: 0.3389, method: 'simulation', samples: 20_000,
        lo: 0.3323715148516947, hi: 0.34549035916558224,
      },
      perPattern: { P: {
        p: 0.3389, method: 'simulation', samples: 20_000,
        lo: 0.3323715148516947, hi: 0.34549035916558224,
      } },
    },
    {
      handSize: 6,
      success: {
        p: 0.3981, method: 'simulation', samples: 20_000,
        lo: 0.3913361055355578, hi: 0.4049030314126763,
      },
      perPattern: { P: {
        p: 0.3981, method: 'simulation', samples: 20_000,
        lo: 0.3913361055355578, hi: 0.4049030314126763,
      } },
    },
  ]);
});
