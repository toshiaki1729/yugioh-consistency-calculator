import { createHandMatcher } from './flow';
import type { EngineInput, Estimate, ProgressCallback } from './types';

export function runSampling(input: EngineInput, handSize: number, onProgress?: ProgressCallback): Estimate {
  const { samples, seed } = input.limits;
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
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
      const j = i + Math.floor(random() * (deck.length - i));
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
    if (onProgress && (sample & 4095) === 0) onProgress(sample, samples);
  }
  if (onProgress && (samples & 4095) !== 0) onProgress(samples, samples);
  const p = successes / samples;
  const z = 1.959963984540054;
  const z2 = z * z;
  const denominator = 1 + z2 / samples;
  const center = (p + z2 / (2 * samples)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / samples + z2 / (4 * samples * samples)) / denominator;
  return {
    p, method: 'sampling', samples,
    lo: successes === 0 ? 0 : Math.max(0, center - radius),
    hi: successes === samples ? 1 : Math.min(1, center + radius),
  };
}
