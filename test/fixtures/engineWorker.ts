import { vi } from 'vitest';
import { runEngine } from '../../src/engine/run';
import type { EngineWorker, RunMessage, WorkerMessage } from '../../src/engine/client';

export class FakeEngineWorker implements EngineWorker {
  onmessage: EngineWorker['onmessage'] = null;
  onerror: EngineWorker['onerror'] = null;
  onmessageerror: EngineWorker['onmessageerror'] = null;
  terminate = vi.fn();
  deferred = false;
  request: RunMessage | null = null;
  reply: EngineWorker['onmessage'] = null;

  postMessage(message: RunMessage) {
    this.request = message;
    this.reply = this.onmessage;
    if (!this.deferred) this.complete();
  }

  emit(data: WorkerMessage) {
    this.reply?.({ data } as MessageEvent<WorkerMessage>);
  }

  complete() {
    const { requestId, input } = this.request!;
    const results = runEngine(input, (done, total) => this.emit({ type: 'progress', requestId, done, total }));
    this.emit({ type: 'result', requestId, results });
  }
}
