import { describe, expect, it, vi } from 'vitest';
import { createEngineClient } from '../src/engine/client';
import { runEngine } from '../src/engine/run';
import { DEFAULT_LIMITS } from '../src/engine/types';
import type { EngineInput } from '../src/engine/types';
import { FakeEngineWorker } from './fixtures/engineWorker';

const input: EngineInput = { deckSize: 40, classes: [{ key: 'a', count: 3 }], otherCount: 37,
  patterns: [{ id: 'p1', slots: [{ count: 1, distinct: false, members: [0] }] }], handSizes: [5, 6], limits: DEFAULT_LIMITS };

describe('Worker クライアント', () => {
  it('同期の偽 Worker でも結果と進捗を受け取り、Worker を再利用する', async () => {
    const worker = new FakeEngineWorker();
    const create = vi.fn(() => worker);
    const client = createEngineClient(create);
    const progress = vi.fn();
    const outcome = await client.run(input, progress).promise;
    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') throw new Error('計算結果がありません');
    const expected = runEngine(input);
    expect(outcome.results.map(({ elapsedMs: _, ...result }) => result))
      .toEqual(expected.map(({ elapsedMs: _, ...result }) => result));
    expect(progress.mock.calls[0][0]).toBe(0);
    expect(progress.mock.calls.at(-1)![0]).toBe(progress.mock.calls.at(-1)![1]);
    await client.run(input).promise;
    expect(create).toHaveBeenCalledTimes(1);
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('中止で terminate・再生成し、遅れて届いた旧リクエストの応答を無視する', async () => {
    const workers: FakeEngineWorker[] = [];
    const client = createEngineClient(() => { const worker = new FakeEngineWorker(); worker.deferred = true; workers.push(worker); return worker; });
    const progress = vi.fn();
    const task = client.run(input, progress);
    task.cancel();
    await expect(task.promise).resolves.toEqual({ status: 'cancelled' });
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(2);
    task.cancel();
    const next = client.run(input);
    workers[0].complete();
    expect(progress).not.toHaveBeenCalled();
    workers[1].emit({ type: 'error', requestId: -1, message: '旧応答' });
    workers[1].complete();
    await expect(next.promise).resolves.toMatchObject({ status: 'done' });
    client.dispose();
  });

  it('新しい実行と dispose は未完了の promise を cancelled にする', async () => {
    const workers: FakeEngineWorker[] = [];
    const client = createEngineClient(() => { const worker = new FakeEngineWorker(); worker.deferred = true; workers.push(worker); return worker; });
    const first = client.run(input);
    const second = client.run(input);
    await expect(first.promise).resolves.toEqual({ status: 'cancelled' });
    first.cancel();
    expect(workers[1].terminate).not.toHaveBeenCalled();
    client.dispose();
    await expect(second.promise).resolves.toEqual({ status: 'cancelled' });
    expect(workers).toHaveLength(2);
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
    await expect(client.run(input).promise).resolves.toMatchObject({ status: 'error' });
  });

  it.each(['message', 'runtime', 'decode', 'send', 'create'] as const)('%s エラーを reject せず返す', async kind => {
    const worker = new FakeEngineWorker();
    worker.deferred = true;
    const client = createEngineClient(() => { if (kind === 'create') throw new Error('起動拒否'); return worker; });
    if (kind === 'send') worker.postMessage = () => { throw new Error('送信拒否'); };
    const task = client.run(input);
    if (kind === 'message') worker.emit({ type: 'error', requestId: worker.request!.requestId, message: '計算に失敗しました' });
    if (kind === 'runtime') worker.onerror?.(new ErrorEvent('error', { message: '停止' }));
    if (kind === 'decode') worker.onmessageerror?.(new MessageEvent('messageerror'));
    await expect(task.promise).resolves.toMatchObject({ status: 'error', message: expect.any(String) });
    client.dispose();
  });
});
