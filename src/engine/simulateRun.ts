import { PROGRESS_STATE_MASK } from './constants';
import { createSeededRandom, UINT32_RANGE } from './random';
import { createTrialRunner } from './simulate';
import type { SimulationInput } from './simulateTypes';
import type { HandResult, ProgressCallback } from './types';
import { estimateWilsonInterval } from './wilson';

/** 同じ初手と乱数列で各目標を試行し、確率と 95% Wilson 区間を返す。 */
export function runSimulation(
  input: SimulationInput, handSize: number, onProgress?: ProgressCallback,
): Pick<HandResult, 'success' | 'perPattern'> {
  const { samples, seed } = input.limits;
  const generateRandom = createSeededRandom(seed);
  const runner = createTrialRunner(input);
  const deckSize = input.cards.reduce((sum, card) => sum + card.count, 0);
  const order = new Uint8Array(deckSize);
  let offset = 0;
  for (let i = 0; i < input.cards.length; i++) {
    order.fill(i, offset, offset + input.cards[i].count);
    offset += input.cards[i].count;
  }
  let successes = 0;
  const patternSuccesses = new Float64Array(input.patterns.length);
  for (let sample = 1; sample <= samples; sample++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(generateRandom() * (i + 1));
      const card = order[i];
      order[i] = order[j];
      order[j] = card;
    }
    const trialSeed = Math.floor(generateRandom() * UINT32_RANGE);
    const result = runner(order, handSize, () => createSeededRandom(trialSeed));
    if (result.overall) successes++;
    for (let i = 0; i < patternSuccesses.length; i++) {
      if (result.perPattern[i]) patternSuccesses[i]++;
    }
    if (onProgress && (sample & PROGRESS_STATE_MASK) === 0) onProgress(sample, samples);
  }
  if (onProgress && (samples & PROGRESS_STATE_MASK) !== 0) onProgress(samples, samples);
  return {
    success: estimateWilsonInterval(successes, samples, 'simulation'),
    perPattern: Object.fromEntries(input.patterns.map((pattern, index) => [
      pattern.id, estimateWilsonInterval(patternSuccesses[index], samples, 'simulation'),
    ])),
  };
}
