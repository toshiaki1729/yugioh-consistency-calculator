import { runEngine } from './run';
import type { RunMessage, WorkerMessage } from './client';

declare const self: {
  onmessage: ((event: MessageEvent<RunMessage>) => void) | null;
  postMessage(message: WorkerMessage): void;
};

self.onmessage = ({ data }) => {
  if (data.type !== 'run') return;
  const { requestId, input } = data;
  let lastProgress = -Infinity;
  try {
    const results = runEngine(input, (done, total) => {
      const now = performance.now();
      if (now - lastProgress < 100 && done !== total) return;
      lastProgress = now;
      self.postMessage({ type: 'progress', requestId, done, total });
    });
    self.postMessage({ type: 'result', requestId, results });
  } catch (error) {
    self.postMessage({ type: 'error', requestId,
      message: error instanceof Error ? `計算に失敗しました: ${error.message}` : '計算に失敗しました。' });
  }
};
