import { useLayoutEffect, useRef, useState } from 'react';
import { createEngineClient } from '../../engine/client';
import type { EngineWorker } from '../../engine/client';
import type { CalculationInput, HandResult } from '../../engine/types';

interface CalculationState {
  deckId: string | null;
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'error';
  progress: { done: number; total: number };
  error: string | null;
}

interface CalculationSnapshot {
  deckId: string;
  inputKey: string;
  results: HandResult[];
}

const INITIAL_PROGRESS = { done: 0, total: 1 };

/** Worker の実行・中止とデッキごとの実行状態・直近の結果を管理する。 */
export function useCalculationTask(deckId: string | null, input: CalculationInput | null,
  inputKey: string | null, createWorker?: () => EngineWorker) {
  const [snapshot, setSnapshot] = useState<CalculationSnapshot | null>(null);
  const [state, setState] = useState<CalculationState>({
    deckId, status: 'idle', progress: INITIAL_PROGRESS, error: null,
  });
  const client = useRef<ReturnType<typeof createEngineClient> | null>(null);
  const running = useRef<ReturnType<ReturnType<typeof createEngineClient>['run']> | null>(null);
  if (state.deckId !== deckId) {
    setState({ deckId, status: 'idle', progress: INITIAL_PROGRESS, error: null });
  }
  useLayoutEffect(() => () => {
    // デッキ切替とアンマウントで旧リクエストを切り離してから終了する。
    running.current = null;
    client.current?.dispose();
    client.current = null;
  }, [deckId]);

  function run() {
    if (deckId === null || input === null || inputKey === null || running.current) return;
    client.current ??= createEngineClient(createWorker);
    setState({ deckId, status: 'running', progress: INITIAL_PROGRESS, error: null });
    const task = client.current.run(input, (done, total) =>
      setState(current => ({ ...current, progress: { done, total } })));
    running.current = task;
    void task.promise.then(outcome => {
      if (running.current !== task) return;
      running.current = null;
      const error = outcome.status === 'error' ? outcome.message : null;
      setState(current => ({ ...current, status: outcome.status, error }));
      if (outcome.status === 'done') {
        setSnapshot({ deckId, inputKey, results: outcome.results });
      }
    });
  }
  function cancel() {
    running.current?.cancel();
  }
  return {
    snapshot, status: state.status, progress: state.progress, error: state.error, run, cancel,
  };
}
