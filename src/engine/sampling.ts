import { createHandMatcher } from './flow';
import { PROGRESS_STATE_MASK } from './constants';
import type { EngineInput, Estimate, ProgressCallback } from './types';

const WILSON_Z_95 = 1.959963984540054;
const UINT32_RANGE = 4294967296;

/** 再現可能な手札抽出で確率と95%信頼区間を推定する。 */
export function runSampling(
  input: EngineInput, handSize: number, onProgress?: ProgressCallback,
): Estimate {
  const { samples, seed } = input.limits;
  let state = seed >>> 0;
  const generateRandom = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
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
  const matches = createHandMatcher(input.patterns, handSize);
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

function estimateWilsonInterval(successes: number, samples: number): Estimate {
  const probability = successes / samples;
  const squaredZ = WILSON_Z_95 * WILSON_Z_95;
  const denominator = 1 + squaredZ / samples;
  const center = (probability + squaredZ / (2 * samples)) / denominator;
  const variance = probability * (1 - probability) / samples;
  const correction = squaredZ / (4 * samples * samples);
  const radius = WILSON_Z_95 * Math.sqrt(variance + correction) / denominator;
  return {
    p: probability, method: 'sampling', samples,
    lo: successes === 0 ? 0 : Math.max(0, center - radius),
    hi: successes === samples ? 1 : Math.min(1, center + radius),
  };
}
