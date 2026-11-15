import type { EngineInput, HandResult, ProgressCallback } from './types';

export interface RunMessage { type: 'run'; requestId: number; input: EngineInput }
export type WorkerMessage =
  | { type: 'progress'; requestId: number; done: number; total: number }
  | { type: 'result'; requestId: number; results: HandResult[] }
  | { type: 'error'; requestId: number; message: string };
export type CalculationOutcome =
  | { status: 'done'; results: HandResult[] }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface EngineWorker {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: RunMessage): void;
  terminate(): void;
}

export function createEngineClient(createWorker: () => EngineWorker = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })) {
  let worker: EngineWorker | null = null;
  let requestId = 0;
  let pending: { id: number; finish: (outcome: CalculationOutcome) => void; cancel: () => void } | null = null;
  let disposed = false;
  let creationError: string | null = null;

  function prepareWorker() {
    // Worker の生成拒否も、呼び出し元へ必ず完了結果として返す。
    try {
      worker = createWorker();
      creationError = null;
    } catch {
      worker = null;
      creationError = '計算用 Worker を起動できませんでした。';
    }
  }

  function stopWorker() {
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    worker = null;
  }

  return {
    run(input: EngineInput, onProgress?: ProgressCallback) {
      pending?.cancel();
      const id = ++requestId;
      let resolve!: (outcome: CalculationOutcome) => void;
      const promise = new Promise<CalculationOutcome>(done => { resolve = done; });
      const finish = (outcome: CalculationOutcome) => {
        if (pending?.id !== id) return;
        pending = null;
        resolve(outcome);
      };
      const cancel = () => {
        if (pending?.id !== id) return;
        stopWorker();
        finish({ status: 'cancelled' });
        if (!disposed) prepareWorker();
      };
      pending = { id, finish, cancel };
      if (disposed) {
        finish({ status: 'error', message: '計算クライアントは終了しています。' });
        return { promise, cancel };
      }
      if (!worker) prepareWorker();
      if (!worker) {
        finish({ status: 'error', message: creationError! });
        return { promise, cancel };
      }
      worker.onmessage = ({ data }) => {
        if (data.requestId !== id || pending?.id !== id) return;
        if (data.type === 'progress') onProgress?.(data.done, data.total);
        else if (data.type === 'result') finish({ status: 'done', results: data.results });
        else finish({ status: 'error', message: data.message });
      };
      const fail = (message: string) => {
        if (pending?.id !== id) return;
        stopWorker();
        finish({ status: 'error', message });
      };
      worker.onerror = event => {
        event.preventDefault();
        fail(event.message ? `計算に失敗しました: ${event.message}` : '計算用 Worker でエラーが発生しました。');
      };
      worker.onmessageerror = () => fail('計算結果を受信できませんでした。');
      try {
        worker.postMessage({ type: 'run', requestId: id, input });
      } catch {
        fail('計算データを Worker に送信できませんでした。');
      }
      return { promise, cancel };
    },
    dispose() {
      disposed = true;
      pending?.cancel();
      stopWorker();
    },
  };
}
