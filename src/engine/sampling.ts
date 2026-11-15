import { createHandMatcher } from './flow';
import { PROGRESS_STATE_MASK } from './constants';
import { createSeededRandom } from './random';
import { estimateWilsonInterval } from './wilson';
import type { EngineInput, Estimate, ProgressCallback } from './types';

/** 再現可能な手札抽出で確率と95%信頼区間を推定する。 */
export function runSampling(
  input: EngineInput, handSize: number, onProgress?: ProgressCallback,
): Estimate {
  const { samples, seed } = input.limits;
  const generateRandom = createSeededRandom(seed);
  const deck = new Uint8Array(input.deckSize);
  const otherIndex = input.classes.length;
  let offset = 0;
  for (let i = 0; i < input.classes.length; i++) {
    deck.fill(i, offset, offset + input.classes[i].count);
    offset += input.classes[i].count;
  }
  deck.fill(otherIndex, offset);
  const hand = new Uint8Array(otherIndex + 1);
  const swaps = new Uint8Array(handSize);
  const matches = createHandMatcher(
    input.patterns, handSize, input.classes.map(group => group.count),
  );
  let successes = 0;
  for (let sample = 1; sample <= samples; sample++) {
    hand.fill(0);
    for (let i = 0; i < handSize; i++) {
      const j = i + Math.floor(generateRandom() * (deck.length - i));
      swaps[i] = j;
      const value = deck[j];
      deck[j] = deck[i];
      deck[i] = value;
      hand[value]++;
    }
    if (matches(hand)) successes++;
    // 次の標本も同じ並びから抽出し、毎回のデッキ配列生成を避ける。
    for (let i = handSize - 1; i >= 0; i--) {
      const j = swaps[i];
      const value = deck[j];
      deck[j] = deck[i];
      deck[i] = value;
    }
    if (onProgress && (sample & PROGRESS_STATE_MASK) === 0) onProgress(sample, samples);
  }
  if (onProgress && (samples & PROGRESS_STATE_MASK) !== 0) onProgress(samples, samples);
  return estimateWilsonInterval(successes, samples);
}
