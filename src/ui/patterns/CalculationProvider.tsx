import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useResolveCard } from '../../carddb/useCardDb';
import { compile } from '../../engine/compile';
import { createEngineClient } from '../../engine/client';
import type { EngineWorker } from '../../engine/client';
import type { EngineInput, HandResult } from '../../engine/types';
import { useAppState } from '../../state/store';

export function stableInputKey(input: EngineInput): string {
  return JSON.stringify(input, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}

interface CalculationContextValue {
  results: HandResult[] | null;
  stale: boolean;
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'error';
  progress: { done: number; total: number };
  error: string | null;
  reason: string | null;
  run: () => void;
  cancel: () => void;
}
const CalculationContext = createContext<CalculationContextValue | null>(null);

export function CalculationProvider({ children, createWorker }: { children: ReactNode; createWorker?: () => EngineWorker }) {
  const { app, activeDeck } = useAppState();
  const resolveCard = useResolveCard();
  const deckId = activeDeck?.id ?? null;
  const custom = app.settings.customHandSize;
  const handSizes = custom !== null && custom !== 5 && custom !== 6 ? [5, 6, custom] : [5, 6];
  const compiled = activeDeck ? compile(activeDeck, resolveCard, handSizes) : null;
  const inputKey = compiled?.ok ? stableInputKey(compiled.value) : null;
  const [snapshot, setSnapshot] = useState<{ deckId: string; inputKey: string; results: HandResult[] } | null>(null);
  const [status, setStatus] = useState<CalculationContextValue['status']>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [error, setError] = useState<string | null>(null);
  const client = useRef<ReturnType<typeof createEngineClient> | null>(null);
  const running = useRef<ReturnType<ReturnType<typeof createEngineClient>['run']> | null>(null);

  useLayoutEffect(() => {
    setStatus('idle');
    setError(null);
    setProgress({ done: 0, total: 1 });
    return () => {
      // デッキ切替とアンマウントで旧リクエストを切り離してから終了する。
      running.current = null;
      client.current?.dispose();
      client.current = null;
    };
  }, [deckId]);

  function run() {
    if (!activeDeck || !compiled?.ok || inputKey === null || running.current) return;
    const owner = activeDeck.id;
    client.current ??= createEngineClient(createWorker);
    setStatus('running');
    setError(null);
    setProgress({ done: 0, total: 1 });
    const task = client.current.run(compiled.value, (done, total) => setProgress({ done, total }));
    running.current = task;
    void task.promise.then(outcome => {
      if (running.current !== task) return;
      running.current = null;
      setStatus(outcome.status);
      if (outcome.status === 'done') setSnapshot({ deckId: owner, inputKey, results: outcome.results });
      if (outcome.status === 'error') setError(outcome.message);
    });
  }

  const visible = snapshot?.deckId === deckId ? snapshot : null;
  return <CalculationContext.Provider value={{
    results: visible?.results ?? null, stale: visible !== null && visible.inputKey !== inputKey,
    status, progress, error, reason: compiled ? (compiled.ok ? null : compiled.error) : 'デッキを作成してください。',
    run, cancel: () => running.current?.cancel(),
  }}>{children}</CalculationContext.Provider>;
}

export function useCalculation() {
  const value = useContext(CalculationContext);
  if (!value) throw new Error('useCalculation は CalculationProvider 内で使用してください。');
  return value;
}
