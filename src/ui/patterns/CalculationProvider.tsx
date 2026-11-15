import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useResolveCard } from '../../carddb/useCardDb';
import { compile } from '../../engine/compile';
import type { EngineWorker } from '../../engine/client';
import type { EngineInput, HandResult } from '../../engine/types';
import { useAppState } from '../../state/store';
import { FIRST_HAND_SIZE, SECOND_HAND_SIZE } from './calculationConstants';
import { useCalculationTask } from './useCalculationTask';

/** オブジェクトのキー順によらず計算入力を識別する。 */
export function stableInputKey(input: EngineInput): string {
  return JSON.stringify(input, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries);
  });
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

/** 現在のデッキの計算入力と結果を画面に提供する。 */
export function CalculationProvider({ children, createWorker }: {
  children: ReactNode; createWorker?: () => EngineWorker;
}) {
  const { app, activeDeck } = useAppState();
  const resolveCard = useResolveCard();
  const deckId = activeDeck?.id ?? null;
  const customHandSize = app.settings.customHandSize;
  const handSizes = useMemo(() => {
    const sizes = [FIRST_HAND_SIZE, SECOND_HAND_SIZE];
    if (customHandSize !== null && !sizes.includes(customHandSize)) sizes.push(customHandSize);
    return sizes;
  }, [customHandSize]);
  const compiled = useMemo(() => activeDeck ? compile(activeDeck, resolveCard, handSizes) : null,
    [activeDeck, resolveCard, handSizes]);
  const input = compiled?.ok ? compiled.value : null;
  const inputKey = useMemo(() => input ? stableInputKey(input) : null, [input]);
  const { snapshot, ...task } = useCalculationTask(deckId, input, inputKey, createWorker);
  const visible = snapshot?.deckId === deckId ? snapshot : null;
  let reason: string | null = null;
  if (!compiled) reason = 'デッキを作成してください。';
  else if (!compiled.ok) reason = compiled.error;
  const context: CalculationContextValue = {
    ...task, results: visible?.results ?? null,
    stale: visible !== null && visible.inputKey !== inputKey, reason,
  };
  return <CalculationContext.Provider value={context}>{children}</CalculationContext.Provider>;
}

/** 現在のデッキの計算状態と実行・中止操作を取得する。 */
export function useCalculation() {
  const value = useContext(CalculationContext);
  if (!value) throw new Error('useCalculation は CalculationProvider 内で使用してください。');
  return value;
}
