import type { CalculationInput, HandResult, ProgressCallback } from './types';

/** Worker に送る計算要求。 */
export interface RunMessage { type: 'run'; requestId: number; input: CalculationInput }
/** 要求 ID を伴う Worker の進捗と完了通知。 */
export type WorkerMessage =
  | { type: 'progress'; requestId: number; done: number; total: number }
  | { type: 'result'; requestId: number; results: HandResult[] }
  | { type: 'error'; requestId: number; message: string };
/** 成功・中止・失敗を表す計算の完了結果。 */
export type CalculationOutcome =
  | { status: 'done'; results: HandResult[] }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** 計算クライアントが使用する Worker の接続口。 */
export interface EngineWorker {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: RunMessage): void;
  terminate(): void;
}

interface PendingCalculation {
  id: number;
  finish: (outcome: CalculationOutcome) => void;
  cancel: () => void;
}

/** 計算要求の送信、中止と Worker の寿命を管理する。 */
export function createEngineClient(createWorker: () => EngineWorker = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })) {
  let worker: EngineWorker | null = null;
  let requestId = 0;
  let pending: PendingCalculation | null = null;
  let isDisposed = false;
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

  function sendRequest(
    target: EngineWorker, request: PendingCalculation,
    input: CalculationInput, onProgress?: ProgressCallback,
  ) {
    const { id, finish } = request;
    target.onmessage = ({ data }) => {
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
    target.onerror = event => {
      event.preventDefault();
      fail(event.message ? `計算に失敗しました: ${event.message}` : '計算用 Worker でエラーが発生しました。');
    };
    target.onmessageerror = () => fail('計算結果を受信できませんでした。');
    try {
      target.postMessage({ type: 'run', requestId: id, input });
    } catch {
      fail('計算データを Worker に送信できませんでした。');
    }
  }

  return {
    run(input: CalculationInput, onProgress?: ProgressCallback) {
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
        if (!isDisposed) prepareWorker();
      };
      pending = { id, finish, cancel };
      if (isDisposed) {
        finish({ status: 'error', message: '計算クライアントは終了しています。' });
        return { promise, cancel };
      }
      if (!worker) prepareWorker();
      if (!worker) {
        finish({ status: 'error', message: creationError! });
        return { promise, cancel };
      }
      sendRequest(worker, pending, input, onProgress);
      return { promise, cancel };
    },
    dispose() {
      isDisposed = true;
      pending?.cancel();
      stopWorker();
    },
  };
}
