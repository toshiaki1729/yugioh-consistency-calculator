import { createHandMatcher } from './flow';
import type { EngineInput, ExactResult, ProgressCallback } from './types';

const combinations = Array.from({ length: 61 }, () => new Float64Array(61));
for (let n = 0; n <= 60; n++) {
  combinations[n][0] = combinations[n][n] = 1;
  for (let k = 1; k < n; k++) combinations[n][k] = combinations[n - 1][k - 1] + combinations[n - 1][k];
}

export function binomial(n: number, k: number): number {
  return k < 0 || k > n ? 0 : combinations[n][k];
}

export function countStates(input: EngineInput, handSize: number): number {
  let counts = new Float64Array(handSize + 1);
  counts[0] = 1;
  // other の枚数はベクトルから一意に決まるため、最後の一成分として数えられる。
  for (const capacity of [...input.classes.map(group => group.count), input.otherCount]) {
    const next = new Float64Array(handSize + 1);
    for (let used = 0; used <= handSize; used++) {
      for (let take = 0; take <= Math.min(capacity, handSize - used); take++) {
        next[used + take] += counts[used];
      }
    }
    counts = next;
  }
  return counts[handSize];
}

export function runExact(
  input: EngineInput,
  handSize: number,
  onProgress?: ProgressCallback,
  states = countStates(input, handSize),
): ExactResult {
  const size = input.classes.length;
  const hand = new Uint8Array(size);
  const capacities = Uint8Array.from(input.classes, group => group.count);
  const suffix = new Uint8Array(size + 1);
  suffix[size] = input.otherCount;
  for (let i = size - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + capacities[i];
  const matches = createHandMatcher(input.patterns, handSize);
  let done = 0;
  let weightSum = 0;
  let successWeight = 0;

  const visit = (index: number, remaining: number, weight: number): void => {
    if (index === size) {
      const fullWeight = weight * combinations[input.otherCount][remaining];
      weightSum += fullWeight;
      if (matches(hand)) successWeight += fullWeight;
      done++;
      if (onProgress && (done & 4095) === 0) onProgress(done, states);
      return;
    }
    const min = Math.max(0, remaining - suffix[index + 1]);
    const max = Math.min(capacities[index], remaining);
    const choices = combinations[capacities[index]];
    for (let count = min; count <= max; count++) {
      hand[index] = count;
      visit(index + 1, remaining - count, weight * choices[count]);
    }
  };
  visit(0, handSize, 1);
  if (onProgress && (done & 4095) !== 0) onProgress(done, states);
  return {
    estimate: { p: successWeight / combinations[input.deckSize][handSize], method: 'exact', states },
    weightSum,
  };
}
