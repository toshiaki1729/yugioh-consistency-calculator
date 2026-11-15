import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngineClient } from '../src/engine/client';
import type { RunMessage, WorkerMessage } from '../src/engine/client';
import { binomial } from '../src/engine/exact';
import { runCalculation } from '../src/engine/run';
import {
  compileCalculationDeck, createCalculationDeck, createCalculationEffect,
} from './fixtures/calculationDeck';
import { FakeEngineWorker } from './fixtures/engineWorker';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

describe('デッキからの計算と二項係数の式', () => {
  const goblin = createCalculationDeck();
  const desires = createCalculationDeck([3, 1, 36]);
  desires.effects[0] = { ...createCalculationEffect([
    { kind: 'banishTop', count: 10 }, { kind: 'draw', count: 2 },
  ]), oncePerTurn: true };
  const afterBanish = createCalculationDeck([3, 2, 35]);
  afterBanish.effects = [];
  afterBanish.patterns[0].conditions = [{
    kind: 'deckAfterBanish', target: { type: 'card', cardId: 'k2' }, banish: 3, count: 1,
  }];
  let afterBanishExpected = 0;
  for (let a = 1; a <= 3; a++) {
    for (let k = 0; k <= 2; k++) {
      const remaining = 2 - k;
      const survival = remaining === 0 ? 0
        : 1 - binomial(35 - remaining, 3 - remaining) / binomial(35, 3);
      afterBanishExpected += binomial(3, a) * binomial(2, k) * binomial(35, 5 - a - k)
        / binomial(40, 5) * survival;
    }
  }
  it.each([
    { name: '1枚ドロー', deck: goblin, expected: 1 - binomial(34, 5) / binomial(37, 5) },
    { name: '10枚除外・2枚ドロー', deck: desires, expected: 1 - binomial(37, 5) / binomial(40, 5)
      + binomial(36, 4) / binomial(40, 5) * (1 - binomial(32, 2) / binomial(35, 2)) },
    { name: '上から3枚除外後に残る', deck: afterBanish, expected: afterBanishExpected },
  ])('$nameは式との差が0.01以内', ({ deck, expected }) => {
    const input = compileCalculationDeck(deck);
    expect(input.mode).toBe('simulation');
    const result = runCalculation(input)[0];
    expect(result.success).toEqual(result.perPattern.P);
    expect(result.success).toMatchObject({ method: 'simulation', samples: 200_000 });
    expect(result.success.lo).toBeLessThan(result.success.p);
    expect(result.success.hi).toBeGreaterThan(result.success.p);
    expect(Math.abs(result.success.p - expected)).toBeLessThanOrEqual(0.01);
    expect(result.handSize).toBe(5);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('1枚ドローだけなら、効果カードを抜いたデッキの厳密値との差が0.01以内', () => {
    const reduced = { ...goblin, effects: [], entries: goblin.entries.filter(entry => entry.cardId !== 'k2') };
    const exact = runCalculation(compileCalculationDeck(reduced))[0];
    expect(exact.success.method).toBe('exact');
    const simulated = runCalculation(compileCalculationDeck(goblin))[0];
    expect(Math.abs(simulated.success.p - exact.success.p)).toBeLessThanOrEqual(0.01);
  }, 30_000);
});

it('各パターンの値が同じシードで単独有効のシミュレーション全体と一致する', () => {
  const deck = createCalculationDeck([3, 3, 2, 32]);
  deck.effects[0].steps = [
    { kind: 'excavate', count: 3, target: null },
    { kind: 'search', target: { type: 'group', groupId: 'starter' } },
    { kind: 'draw', count: 1 },
  ];
  deck.patterns.push({
    id: 'Q', name: '別の初動', enabled: true,
    slots: [{ id: 'q', source: { type: 'card', cardId: 'k3' }, count: 2, distinctNames: false }],
    conditions: [{ kind: 'deckAfterBanish', target: { type: 'card', cardId: 'k1' }, banish: 3, count: 1 }],
  });
  const limits = { samples: 10_000, seed: 42 };
  const combined = runCalculation(compileCalculationDeck(deck, [5, 6], limits));
  for (const pattern of deck.patterns) {
    const single = { ...deck, patterns: deck.patterns.map(item => ({ ...item, enabled: item.id === pattern.id })) };
    const input = compileCalculationDeck(single, [5, 6], limits);
    const results = runCalculation(input);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].success).toEqual(combined[i].perPattern[pattern.id]);
    }
  }
});

it('手札枚数ごとの進捗をsamples×手札枚数で通算する', () => {
  const input = compileCalculationDeck(createCalculationDeck(), [5, 6, 1], { samples: 5000 });
  const updates: number[][] = [];
  const results = runCalculation(input, (done, total) => updates.push([done, total]));
  expect(updates).toEqual([
    [0, 15000], [4096, 15000], [5000, 15000], [9096, 15000],
    [10000, 15000], [14096, 15000], [15000, 15000],
  ]);
  expect(results.map(result => result.handSize)).toEqual([5, 6, 1]);
  for (const result of results) expect(result.success.samples).toBe(5000);
});

it('実Workerエントリがシミュレーションの進捗と結果を返す', async () => {
  const input = compileCalculationDeck(createCalculationDeck(), [5, 6], { samples: 1000 });
  const scope = {
    onmessage: null as ((event: MessageEvent<RunMessage>) => void) | null,
    postMessage: vi.fn<(message: WorkerMessage) => void>(),
  };
  vi.stubGlobal('self', scope);
  await import('../src/engine/worker');
  scope.onmessage!({ data: { type: 'run', requestId: 27, input } } as MessageEvent<RunMessage>);
  const messages = scope.postMessage.mock.calls.map(([message]) => message);
  expect(messages[0]).toEqual({ type: 'progress', requestId: 27, done: 0, total: 2000 });
  expect(messages.at(-2)).toEqual({ type: 'progress', requestId: 27, done: 2000, total: 2000 });
  const result = messages.at(-1)!;
  if (result.type !== 'result') throw new Error('結果がありません');
  expect(result.requestId).toBe(27);
  expect(result.results.map(({ elapsedMs: _, ...value }) => value))
    .toEqual(runCalculation(input).map(({ elapsedMs: _, ...value }) => value));
});

it('クライアント経由で結果を受け取り、中止後の旧応答を無視して再実行できる', async () => {
  const input = compileCalculationDeck(createCalculationDeck(), [5, 6], { samples: 1000 });
  const workers: FakeEngineWorker[] = [];
  const client = createEngineClient(() => {
    const worker = new FakeEngineWorker();
    worker.deferred = true;
    workers.push(worker);
    return worker;
  });
  const progress = vi.fn();
  const task = client.run(input, progress);
  expect(workers[0].request?.input).toEqual(input);
  task.cancel();
  await expect(task.promise).resolves.toEqual({ status: 'cancelled' });
  expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  expect(workers).toHaveLength(2);
  const next = client.run(input, progress);
  workers[0].complete();
  expect(progress).not.toHaveBeenCalled();
  workers[1].complete();
  const outcome = await next.promise;
  if (outcome.status !== 'done') throw new Error('結果がありません');
  expect(outcome.results.map(({ elapsedMs: _, ...value }) => value))
    .toEqual(runCalculation(input).map(({ elapsedMs: _, ...value }) => value));
  expect(progress.mock.calls.at(-1)).toEqual([2000, 2000]);
  client.dispose();
});
