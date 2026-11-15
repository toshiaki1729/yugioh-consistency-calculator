import type { Estimate } from './types';

const WILSON_Z_95 = 1.959963984540054;

/** 成功回数から確率と 95% Wilson 区間を求める。 */
export function estimateWilsonInterval(
  successes: number, samples: number, method: 'sampling' | 'simulation' = 'sampling',
): Estimate {
  const probability = successes / samples;
  const squaredZ = WILSON_Z_95 * WILSON_Z_95;
  const denominator = 1 + squaredZ / samples;
  const center = (probability + squaredZ / (2 * samples)) / denominator;
  const variance = probability * (1 - probability) / samples;
  const correction = squaredZ / (4 * samples * samples);
  const radius = WILSON_Z_95 * Math.sqrt(variance + correction) / denominator;
  return {
    p: probability, method, samples,
    lo: successes === 0 ? 0 : Math.max(0, center - radius),
    hi: successes === samples ? 1 : Math.min(1, center + radius),
  };
}
