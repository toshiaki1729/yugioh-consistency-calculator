import { createHandMatcher } from './flow';
import type { EngineInput, ExactResult, ProgressCallback } from './types';
import { MAX_DECK_SIZE, PROGRESS_STATE_MASK } from './constants';

const combinations = Array.from(
  { length: MAX_DECK_SIZE + 1 }, () => new Float64Array(MAX_DECK_SIZE + 1),
);
for (let population = 0; population <= MAX_DECK_SIZE; population++) {
  const row = combinations[population];
  row[0] = row[population] = 1;
  for (let selected = 1; selected < population; selected++) {
    const previous = combinations[population - 1];
    row[selected] = previous[selected - 1] + previous[selected];
  }
}

/** デッキから指定枚数を選ぶ組み合わせ数を返す。 */
export function binomial(population: number, selected: number): number {
  return selected < 0 || selected > population ? 0 : combinations[population][selected];
}

/** 列挙対象の手札ベクトル数を数える。 */
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

/** 手札ベクトルを全列挙して厳密確率を求める。 */
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
      if (onProgress && (done & PROGRESS_STATE_MASK) === 0) onProgress(done, states);
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
  if (onProgress && (done & PROGRESS_STATE_MASK) !== 0) onProgress(done, states);
  const probability = successWeight / combinations[input.deckSize][handSize];
  return {
    estimate: { p: probability, method: 'exact', states },
    weightSum,
  };
}
