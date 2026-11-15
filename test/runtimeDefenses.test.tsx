import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { CardDbProvider, useResolveCard } from '../src/carddb/useCardDb';
import { createCardDb } from '../src/carddb/loader';
import type { CardDbState } from '../src/carddb/loader';
import type { CardData } from '../src/domain/types';
import * as compiler from '../src/engine/compileCalculation';
import { createInitialState } from '../src/state/reducer';
import { AppStateProvider, useDispatch } from '../src/state/store';
import * as persist from '../src/state/persist';
import { CalculationProvider, useCalculation } from '../src/ui/patterns/CalculationProvider';
import { FakeEngineWorker } from './fixtures/engineWorker';

const card: CardData = { id: 'k1', konamiId: 1, name: 'テストカード', kind: 'monster', monsterTypes: [], text: '' };
const db = createCardDb({ version: 1, source: 'yaml-yugi', generatedAt: '2026-11-15T00:00:00Z', cards: [card] });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function createState() {
  const state = createInitialState({ newId: () => 'deck-a' });
  state.decks[0].entries = [{ cardId: card.id, name: card.name, count: 40, section: 'main' }];
  state.decks[0].patterns = [{ id: 'p1', name: '初動', enabled: true, slots: [
    { id: 's1', source: { type: 'card', cardId: card.id }, count: 1, distinctNames: false },
  ], conditions: [] }];
  return state;
}

function createStorage(state = createState()) {
  let json = JSON.stringify(state);
  return {
    getItem: (key: string) => key === persist.STORAGE_KEY ? json : null,
    setItem: vi.fn((key: string, value: string) => { if (key === persist.STORAGE_KEY) json = value; }),
    removeItem: vi.fn(), clear: vi.fn(),
  };
}

describe('カード解決の自身のプロパティ参照', () => {
  it('未登録の継承プロパティ名をundefinedにし、カスタム・DB・ページの優先順位を保つ', () => {
    const state = createState();
    const custom: CardData = { ...card, id: 'c:test', konamiId: undefined, custom: true, name: 'カスタム' };
    const page = { ...card, id: 'k2', konamiId: 2, name: 'ページ' };
    state.decks[0].customCards = [custom];
    state.decks[0].pageData = { k1: { ...card, name: '古いページ名' }, k2: page };
    const database = { ...db, getCard: (id: string) => id === custom.id ? { ...custom, name: 'DB' } : db.getCard(id) };
    const storage = createStorage(state);
    const wrapper = ({ children }: { children: ReactNode }) =>
      <AppStateProvider storage={storage}><CardDbProvider db={database}>{children}</CardDbProvider></AppStateProvider>;
    const { result } = renderHook(useResolveCard, { wrapper });
    for (const id of ['toString', '__proto__', 'constructor', 'hasOwnProperty', 'k999']) {
      expect(result.current(id)).toBeUndefined();
    }
    expect(result.current('c:test')).toEqual(custom);
    expect(result.current('k1')).toEqual(card);
    expect(result.current('k2')).toEqual(page);
  });
});

describe('計算準備の例外からの復旧', () => {
  it('compileの例外を1つの案内で表示し、JSON書き出し・再読み込み・保存完了を維持する', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(compiler, 'compileCalculation').mockImplementation(() => { throw new Error('計算準備のテスト例外'); });
    const download = vi.spyOn(persist, 'downloadDeck').mockImplementation(() => {});
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => {});
    const storage = createStorage();
    render(<App db={db} storage={storage} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '問題が発生しました' })).toBeVisible();
    expect(screen.getByText('最後の変更が保存されていない可能性があります。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '現在のデッキを JSON で書き出す' }));
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ id: 'deck-a', entries: createState().decks[0].entries }));
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText('データは保存されています。')).toBeVisible();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
  });
});

function CalculationProbe() {
  const calculation = useCalculation();
  const dispatch = useDispatch();
  return <>
    <button onClick={calculation.run}>実行</button>
    <button onClick={() => dispatch({ type: 'deck/rename', name: '変更後' })}>編集</button>
    <button onClick={() => dispatch({ type: 'settings/setCustomHandSize', handSize: 1 })}>手札変更</button>
    <output>{calculation.status}:{calculation.progress.done}</output>
  </>;
}

describe('計算入力のメモ化', () => {
  it('親描画・保存・進捗・結果では再compileせず、デッキ・手札・DBの変更では再compileする', async () => {
    vi.useFakeTimers();
    const compile = vi.spyOn(compiler, 'compileCalculation');
    const worker = new FakeEngineWorker();
    worker.deferred = true;
    const storage = createStorage();
    let databaseState: CardDbState = { status: 'ready', db };
    let notify = (_state: CardDbState) => {};
    const loader = {
      getState: () => databaseState,
      subscribe: (listener: (state: CardDbState) => void) => { notify = listener; return () => {}; },
      load: async () => databaseState, retry: async () => databaseState,
    };
    function Tree() {
      return <AppStateProvider storage={storage}><CardDbProvider loader={loader}>
        <CalculationProvider createWorker={() => worker}><CalculationProbe /></CalculationProvider>
      </CardDbProvider></AppStateProvider>;
    }
    const view = render(<Tree />);
    expect(compile).toHaveBeenCalledTimes(1);
    view.rerender(<Tree />);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByText('実行'));
    act(() => worker.emit({ type: 'progress', requestId: worker.request!.requestId, done: 1, total: 2 }));
    expect(screen.getByRole('status')).toHaveTextContent('running:1');
    await act(async () => worker.complete());
    expect(screen.getByRole('status')).toHaveTextContent('done');
    expect(compile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('編集'));
    expect(compile).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText('手札変更'));
    expect(compile).toHaveBeenCalledTimes(3);
    expect(compile.mock.calls.at(-1)?.[2]).toEqual([5, 6, 1]);
    act(() => { databaseState = { status: 'loading' }; notify(databaseState); });
    expect(compile).toHaveBeenCalledTimes(4);
    act(() => { databaseState = { status: 'error', error: '取得失敗' }; notify(databaseState); });
    expect(compile).toHaveBeenCalledTimes(4);
    act(() => { databaseState = { status: 'ready', db: { ...db } }; notify(databaseState); });
    expect(compile).toHaveBeenCalledTimes(5);
  });
});

describe('パターン結果の自身のプロパティ参照', () => {
  it('結果にない継承プロパティ名のパターンは両方の一覧で未計算と表示する', async () => {
    const state = createState();
    state.decks[0].patterns.push(...['toString', '__proto__', 'constructor'].map(id => ({
      id, name: id, enabled: true, slots: [], conditions: [],
    })));
    const worker = new FakeEngineWorker();
    render(<App db={db} storage={createStorage(state)} createWorker={() => worker} />);
    const panel = screen.getByRole('complementary', { name: '計算結果' });
    fireEvent.click(panel.querySelector<HTMLButtonElement>('.result-actions button')!);
    await act(async () => {});
    fireEvent.click(screen.getByRole('tab', { name: '初動パターン' }));
    for (const name of ['toString', '__proto__', 'constructor']) {
      expect(within(screen.getByRole('listitem', { name })).getByText('未計算')).toBeVisible();
      expect(within(panel).getByText(name).parentElement).toHaveTextContent('未計算');
    }
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '問題が発生しました' })).not.toBeInTheDocument();
  });
});
