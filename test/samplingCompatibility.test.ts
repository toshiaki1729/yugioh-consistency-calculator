import { expect, it } from 'vitest';
import { runSampling } from '../src/engine/sampling';
import { DEFAULT_LIMITS, type EngineInput } from '../src/engine/types';

it('共有処理への切り出し前に記録したサンプリングの確率・区間と完全一致する', () => {
  const input: EngineInput = {
    deckSize: 40, classes: [{ key: 'a', count: 3 }, { key: 'b', count: 2 }], otherCount: 35,
    patterns: [{
      id: 'p', slots: [{ members: [0, 1], count: 2, distinct: true }],
      conditions: [{ members: [0], minRemaining: 2 }],
    }],
    handSizes: [5, 6], limits: { ...DEFAULT_LIMITS },
  };
  expect([5, 6].map(handSize => runSampling(input, handSize))).toEqual([
    { p: 0.06233, method: 'sampling', samples: 200_000, lo: 0.06127886920099238, hi: 0.0633979433889038 },
    { p: 0.08751, method: 'sampling', samples: 200_000, lo: 0.08627946630401732, hi: 0.08875637902512627 },
  ]);
});
