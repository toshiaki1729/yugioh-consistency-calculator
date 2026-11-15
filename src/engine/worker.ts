import { runCalculation } from './run';
import type { RunMessage, WorkerMessage } from './client';

const PROGRESS_INTERVAL_MS = 100;

declare const self: {
  onmessage: ((event: MessageEvent<RunMessage>) => void) | null;
  postMessage(message: WorkerMessage): void;
};

self.onmessage = ({ data }) => {
  if (data.type !== 'run') return;
  const { requestId, input } = data;
  let lastProgress = -Infinity;
  try {
    const results = runCalculation(input, (done, total) => {
      const now = performance.now();
      if (now - lastProgress < PROGRESS_INTERVAL_MS && done !== total) return;
      lastProgress = now;
      self.postMessage({ type: 'progress', requestId, done, total });
    });
    self.postMessage({ type: 'result', requestId, results });
  } catch (error) {
    self.postMessage({ type: 'error', requestId,
      message: error instanceof Error ? `計算に失敗しました: ${error.message}` : '計算に失敗しました。' });
  }
};
