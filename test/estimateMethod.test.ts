import { expect, it } from 'vitest';
import { formatEstimateMethod, formatSampleCount } from '../src/ui/layout/estimateMethod';

it.each([
  [200000, '20 万回'], [100000, '10 万回'], [5000, '5,000 回'], [9999, '9,999 回'],
  [10000, '1 万回'], [10001, '1.0001 万回'], [12345, '1.2345 万回'], [1, '1 回'],
])('%i 回を %s と表示する', (samples, expected) => {
  expect(formatSampleCount(samples)).toBe(expected);
});

it('方式は3種類を区別し、回数がないときは推測しない', () => {
  expect(formatEstimateMethod({ method: 'exact', p: 0.5 })).toBe('厳密');
  expect(formatEstimateMethod({ method: 'sampling', p: 0.5, samples: 5000 })).toBe('サンプリング');
  expect(formatEstimateMethod({ method: 'simulation', p: 0.5, samples: 200000 })).toBe('シミュレーション（20 万回）');
  expect(formatEstimateMethod({ method: 'simulation', p: 0.5, samples: 5000 })).toBe('シミュレーション（5,000 回）');
  expect(formatEstimateMethod({ method: 'simulation', p: 0.5 })).toBe('シミュレーション');
});
