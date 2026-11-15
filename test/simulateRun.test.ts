import { describe, expect, it } from 'vitest';
import { binomial } from '../src/engine/exact';
import { createSeededRandom, UINT32_RANGE } from '../src/engine/random';
import { createTrialRunner } from '../src/engine/simulate';
import { runSimulation } from '../src/engine/simulateRun';
import type { SimulationInput, SimulationStep } from '../src/engine/simulateTypes';
import { DEFAULT_LIMITS } from '../src/engine/types';

function createInput(counts: number[], steps: SimulationStep[] = [], oncePerTurn = false): SimulationInput {
  return {
    cards: counts.map((count, index) => ({ key: `k${index + 1}`, count })),
    patterns: [{ id: 'A', slots: [{ members: [0], count: 1, distinct: false }], conditions: [] }],
    effects: steps.length === 0 ? [] : [{
      card: 1, oncePerTurn, firstOnly: false, drawLock: 'none', steps,
    }],
    handSizes: [5, 6], limits: { ...DEFAULT_LIMITS },
  };
}

describe('20万回のシミュレーションと二項係数の式', () => {
  const goblin = createInput([3, 3, 34], [{ kind: 'draw', count: 1 }]);
  const desires = createInput([3, 1, 36], [
    { kind: 'banishTop', count: 10 }, { kind: 'draw', count: 2 },
  ], true);
  const afterBanish = createInput([3, 2, 35]);
  afterBanish.patterns[0].conditions = [{ kind: 'deckAfterBanish', banish: 3, members: [1], count: 1 }];
  let afterBanishExpected = 0;
  for (let a = 1; a <= 3; a++) {
    for (let k = 0; k <= 2; k++) {
      const remaining = 2 - k;
      const survival = remaining === 0 ? 0
        : 1 - binomial(35 - remaining, 3 - remaining) / binomial(35, 3);
      afterBanishExpected += binomial(3, a) * binomial(2, k) * binomial(35, 5 - a - k)
        / binomial(40, 5) * survival;
    }
  }
  it.each([
    { name: '成金ゴブリン', input: goblin, expected: 1 - binomial(34, 5) / binomial(37, 5) },
    {
      name: '強欲で貪欲な壺', input: desires,
      expected: 1 - binomial(37, 5) / binomial(40, 5)
        + binomial(36, 4) / binomial(40, 5) * (1 - binomial(32, 2) / binomial(35, 2)),
    },
    { name: '上から3枚除外後にKが残る', input: afterBanish, expected: afterBanishExpected },
  ])('$name: 全体と単独が式の0.01以内で、Wilson区間が付く', ({ input, expected }) => {
    const result = runSimulation(input, 5);
    expect(result.success).toEqual(result.perPattern.A);
    expect(Math.abs(result.success.p - expected)).toBeLessThanOrEqual(0.01);
    const { p, lo, hi } = result.success;
    const samples = 200_000;
    const z = 1.959963984540054;
    const center = (p * samples + z * z / 2) / (samples + z * z);
    const radius = z * Math.sqrt(samples * p * (1 - p) + z * z / 4) / (samples + z * z);
    expect(result.success).toMatchObject({ method: 'simulation', samples });
    expect(lo).toBeCloseTo(center - radius, 14);
    expect(hi).toBeCloseTo(center + radius, 14);
  }, 30_000);
});

it('残りA・A・BからAをサーチすると、続くドローがBになる割合は1/2の0.01以内', () => {
  const input = createInput([1, 1, 2], [
    { kind: 'search', members: [2] }, { kind: 'draw', count: 1 },
  ]);
  const runner = createTrialRunner(input);
  // カード番号 0 が B、1 が効果カード、2 が A。初手は効果カードだけ。
  const order = [1, 2, 2, 0];
  const generateRandom = createSeededRandom(DEFAULT_LIMITS.seed);
  let successes = 0;
  let patternSuccesses = 0;
  for (let sample = 0; sample < 200_000; sample++) {
    const seed = Math.floor(generateRandom() * UINT32_RANGE);
    const result = runner(order, 1, () => createSeededRandom(seed));
    if (result.overall) successes++;
    if (result.perPattern[0]) patternSuccesses++;
  }
  expect(patternSuccesses).toBe(successes);
  expect(Math.abs(successes / 200_000 - 0.5)).toBeLessThanOrEqual(0.01);
}, 30_000);

it('同じシードは全目標で完全再現し、別シードでは変わり、入力を変更しない', () => {
  const input = createInput([3, 3, 34], [{ kind: 'search', members: [0, 2] }, { kind: 'draw', count: 1 }]);
  input.patterns.push({
    id: 'other', slots: [{ members: [2], count: 5, distinct: false }], conditions: [],
  });
  input.limits.samples = 10_000;
  const original = structuredClone(input);
  const first = runSimulation(input, 5);
  runSimulation(input, 6);
  expect(runSimulation(input, 5)).toEqual(first);
  expect(input).toEqual(original);
  expect(runSimulation({ ...input, limits: { ...input.limits, seed: 42 } }, 5)).not.toEqual(first);
  expect(Object.keys(first.perPattern)).toEqual(['A', 'other']);
  expect(first.perPattern.A.p).not.toBe(first.perPattern.other.p);
});

it('目標ごとに同じ乱数列を使い、同じパターンを追加しても元の推定値は変わらない', () => {
  const input = createInput([1, 1, 2], [
    { kind: 'search', members: [2] }, { kind: 'draw', count: 1 },
  ]);
  input.limits.samples = 10_000;
  const first = runSimulation(input, 1);
  input.patterns.push({ ...input.patterns[0], id: '__proto__' });
  const second = runSimulation(input, 1);
  expect(second.success).toEqual(first.success);
  expect(second.perPattern.A).toEqual(first.perPattern.A);
  expect(Object.hasOwn(second.perPattern, '__proto__')).toBe(true);
  expect(second.perPattern.__proto__).toEqual(first.perPattern.A);
});

it.each([1, 4096, 8192, 9000])('%i回の進捗は4096回ごとと最終回だけ通知する', samples => {
  const input = createInput([1, 1]);
  input.limits.samples = samples;
  const updates: number[][] = [];
  runSimulation(input, 1, (done, total) => updates.push([done, total]));
  const expected: number[][] = [];
  for (let done = 4096; done < samples; done += 4096) expected.push([done, samples]);
  expected.push([samples, samples]);
  expect(updates).toEqual(expected);
});

it.each([false, true])('成功率が%sでもWilson区間の幅は0にならない', isSuccess => {
  const input = createInput([1]);
  input.limits.samples = 1000;
  input.patterns[0].slots[0].count = isSuccess ? 1 : 2;
  const result = runSimulation(input, 1);
  const z = 1.959963984540054;
  for (const estimate of [result.success, result.perPattern.A]) {
    expect(estimate.p).toBe(Number(isSuccess));
    expect(estimate.hi! - estimate.lo!).toBeCloseTo(z * z / (1000 + z * z), 12);
    expect(estimate.lo).toBeLessThanOrEqual(estimate.p);
    expect(estimate.hi).toBeGreaterThanOrEqual(estimate.p);
  }
});

it('パターンなしなら全体は0、単独結果は空になる', () => {
  const input = createInput([1]);
  input.patterns = [];
  input.limits.samples = 100;
  const result = runSimulation(input, 1);
  expect(result.success).toMatchObject({ method: 'simulation', p: 0, samples: 100, lo: 0 });
  expect(result.success.hi).toBeGreaterThan(0);
  expect(result.perPattern).toEqual({});
});
