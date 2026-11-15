import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEngine } from '../src/engine/run';
import type { RunMessage, WorkerMessage } from '../src/engine/client';
import { DEFAULT_LIMITS } from '../src/engine/types';

vi.mock('../src/engine/run', () => ({ runEngine: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

const message: RunMessage = { type: 'run', requestId: 42, input: {
  deckSize: 40, classes: [{ key: 'a', count: 3 }], otherCount: 37,
  patterns: [{ id: 'p1', slots: [{ count: 1, distinct: false, members: [0] }], conditions: [] }], handSizes: [5, 6], limits: DEFAULT_LIMITS,
} };

describe('Worker エントリ', () => {
  it('進捗を100ms間隔に間引き、開始・完了・結果を同じrequestIdで返す', async () => {
    const scope = { onmessage: null as ((event: MessageEvent<RunMessage>) => void) | null, postMessage: vi.fn<(message: WorkerMessage) => void>() };
    vi.stubGlobal('self', scope);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.mocked(runEngine).mockImplementation((_input, progress) => {
      for (const [time, done] of [[0, 0], [20, 1], [99, 2], [100, 3], [150, 4], [160, 10]]) {
        now = time;
        progress?.(done, 10);
      }
      return [];
    });
    await import('../src/engine/worker');
    scope.onmessage!({ data: message } as MessageEvent<RunMessage>);
    expect(runEngine).toHaveBeenCalledWith(message.input, expect.any(Function));
    expect(scope.postMessage.mock.calls.map(([data]) => data)).toEqual([
      { type: 'progress', requestId: 42, done: 0, total: 10 },
      { type: 'progress', requestId: 42, done: 3, total: 10 },
      { type: 'progress', requestId: 42, done: 10, total: 10 },
      { type: 'result', requestId: 42, results: [] },
    ]);
  });

  it('エンジン例外を日本語のerrorメッセージにする', async () => {
    const scope = { onmessage: null as ((event: MessageEvent<RunMessage>) => void) | null, postMessage: vi.fn() };
    vi.stubGlobal('self', scope);
    vi.mocked(runEngine).mockImplementation(() => { throw new Error('テスト例外'); });
    await import('../src/engine/worker');
    scope.onmessage!({ data: message } as MessageEvent<RunMessage>);
    expect(scope.postMessage).toHaveBeenCalledWith({ type: 'error', requestId: 42, message: '計算に失敗しました: テスト例外' });
  });
});
