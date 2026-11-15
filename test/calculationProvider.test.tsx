import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createCardDb } from '../src/carddb/loader';
import { CardDbProvider } from '../src/carddb/useCardDb';
import { createInitialState } from '../src/state/reducer';
import { STORAGE_KEY } from '../src/state/persist';
import { AppStateProvider, useDispatch } from '../src/state/store';
import { CalculationProvider, useCalculation } from '../src/ui/patterns/CalculationProvider';
import { createCalculationDeck, createCalculationEffect, resolveCalculationCard } from './fixtures/calculationDeck';
import { FakeEngineWorker } from './fixtures/engineWorker';

it('Providerがシミュレーションを送り、結果・効果順変更・条件変更を画面用データへ反映する', async () => {
  const deck = createCalculationDeck();
  deck.effects.push({ ...createCalculationEffect(), id: 'second', cardId: 'k3' });
  const state = { ...createInitialState(), decks: [deck], activeDeckId: deck.id };
  let stored = JSON.stringify(state);
  const storage = {
    getItem: (key: string) => key === STORAGE_KEY ? stored : null,
    setItem: (key: string, value: string) => { if (key === STORAGE_KEY) stored = value; },
  };
  const db = createCardDb({ version: 1, source: 'yaml-yugi', generatedAt: '2026-11-15T00:00:00Z',
    cards: deck.entries.map(entry => resolveCalculationCard(entry.cardId)) });
  const worker = new FakeEngineWorker();
  worker.deferred = true;
  const wrapper = ({ children }: { children: ReactNode }) =>
    <AppStateProvider storage={storage}><CardDbProvider db={db}>
      <CalculationProvider createWorker={() => worker}>{children}</CalculationProvider>
    </CardDbProvider></AppStateProvider>;
  const { result } = renderHook(() => ({ calculation: useCalculation(), dispatch: useDispatch() }), { wrapper });
  expect(result.current.calculation.reason).toBeNull();
  act(() => result.current.calculation.run());
  expect(result.current.calculation.status).toBe('running');
  expect(worker.request?.input.mode).toBe('simulation');
  await act(async () => worker.complete());
  expect(result.current.calculation.status).toBe('done');
  expect(result.current.calculation.stale).toBe(false);
  expect(result.current.calculation.results?.map(value => value.handSize)).toEqual([5, 6]);
  expect(result.current.calculation.results?.[0].success.method).toBe('simulation');
  const previous = result.current.calculation.results;
  act(() => result.current.dispatch({ type: 'effect/reorder', effectIds: ['second', 'effect'] }));
  expect(result.current.calculation.stale).toBe(true);
  expect(result.current.calculation.results).toBe(previous);
  act(() => result.current.dispatch({ type: 'effect/reorder', effectIds: ['effect', 'second'] }));
  expect(result.current.calculation.stale).toBe(false);
  act(() => result.current.dispatch({ type: 'condition/add', patternId: 'P', condition: {
    kind: 'deckAtLeast', target: { type: 'card', cardId: 'k1' }, count: 1,
  } }));
  expect(result.current.calculation.stale).toBe(true);
}, 30_000);
