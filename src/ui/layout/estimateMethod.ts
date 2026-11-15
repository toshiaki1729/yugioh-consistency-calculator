import type { Estimate } from '../../engine/types';

const TEN_THOUSAND = 10_000;
const SAMPLE_FRACTION_DIGITS = 4;
const sampleFormat = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: SAMPLE_FRACTION_DIGITS,
});
const METHOD_LABELS: Record<Estimate['method'], string> = {
  exact: '厳密', sampling: 'サンプリング', simulation: 'シミュレーション',
};

/** 試行回数を、1万回以上は万単位で省略せずに表示する。 */
export function formatSampleCount(samples: number): string {
  if (samples >= TEN_THOUSAND) return `${sampleFormat.format(samples / TEN_THOUSAND)} 万回`;
  return `${sampleFormat.format(samples)} 回`;
}

/** 計算方式と、シミュレーションの試行回数を表示用に整形する。 */
export function formatEstimateMethod(estimate: Estimate): string {
  const label = METHOD_LABELS[estimate.method];
  if (estimate.method === 'simulation' && estimate.samples !== undefined) {
    return `${label}（${formatSampleCount(estimate.samples)}）`;
  }
  return label;
}
