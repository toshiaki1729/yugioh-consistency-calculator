import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb, createCardDbLoader } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import type { AppState } from '../src/domain/types';
import { createInitialState } from '../src/state/reducer';
import { AppStateProvider, useAppState, useDispatch, useSaveStatus } from '../src/state/store';
import * as persist from '../src/state/persist';
import { ErrorBoundary } from '../src/ui/layout/ErrorBoundary';
import sample from './fixtures/yaml-yugi-sample.json';

const generatedAt = '2026-11-15T00:00:00.000Z';
const db = createCardDb(convertCards(sample, generatedAt).db);
const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
  else Reflect.deleteProperty(document, 'visibilityState');
});

function BrokenView(): never {
  throw new Error('表示テストの例外');
}

function RecoveryHarness({ broken }: { broken: boolean }) {
  const { activeDeck } = useAppState();
  const dispatch = useDispatch();
  const saveStatus = useSaveStatus();
  return <>
    <button onClick={() => dispatch({ type: 'deck/rename', name: '変更後のデッキ' })}>変更</button>
    <output>{saveStatus}</output>
    <ErrorBoundary activeDeck={activeDeck} saveStatus={saveStatus}>
      {broken ? <BrokenView /> : <p>通常の画面</p>}
    </ErrorBoundary>
  </>;
}

describe('例外からの復旧', () => {
  it.each(['saved', 'pending', 'failed'] as const)('%s の保存案内と再読み込み・JSON書き出しを表示する', async saveStatus => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const download = vi.spyOn(persist, 'downloadDeck').mockImplementation(() => {});
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => {});
    const deck = createInitialState().decks[0];
    render(<ErrorBoundary activeDeck={deck} saveStatus={saveStatus}><BrokenView /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('問題が発生しました');
    expect(screen.getByText(saveStatus === 'saved' ? 'データは保存されています。' : '最後の変更が保存されていない可能性があります。')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '現在のデッキを JSON で書き出す' }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(deck);
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith('画面の表示中に問題が発生しました。', expect.any(Error), expect.any(String));
  });

  it('デッキなしでは書き出しを表示しない', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary activeDeck={null} saveStatus="saved"><BrokenView /></ErrorBoundary>);
    expect(screen.queryByRole('button', { name: /JSON/ })).not.toBeInTheDocument();
  });

  it('例外後もProviderの最新デッキを書き出し、保存完了を反映して元データを消さない', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const download = vi.spyOn(persist, 'downloadDeck').mockImplementation(() => {});
    const original = JSON.stringify(createInitialState());
    const storage = { getItem: () => original, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    const view = render(<AppStateProvider storage={storage}><RecoveryHarness broken={false} /></AppStateProvider>);
    fireEvent.click(screen.getByText('変更'));
    view.rerender(<AppStateProvider storage={storage}><RecoveryHarness broken /></AppStateProvider>);
    expect(screen.getByText('最後の変更が保存されていない可能性があります。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /JSON/ }));
    expect(download.mock.calls[0][0].name).toBe('変更後のデッキ');
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('データは保存されています。')).toBeVisible();
    const saved = JSON.parse(storage.setItem.mock.calls.at(-1)![1]) as AppState;
    expect(saved.decks[0].name).toBe('変更後のデッキ');
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
  });
});

describe('離脱時の保存', () => {
  it.each(['pagehide', 'hidden'] as const)('%s で500msを待たず最新状態を保存し、購読を解除する', event => {
    vi.useFakeTimers();
    const storage = { getItem: () => null, setItem: vi.fn() };
    const view = render(<AppStateProvider storage={storage}><RecoveryHarness broken={false} /></AppStateProvider>);
    fireEvent.click(screen.getByText('変更'));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('pending');
    if (event === 'pagehide') fireEvent(window, new Event('pagehide'));
    else {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      fireEvent(document, new Event('visibilitychange'));
      expect(storage.setItem).not.toHaveBeenCalled();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      fireEvent(document, new Event('visibilitychange'));
    }
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [key, json] = storage.setItem.mock.calls[0];
    expect(key).toBe(persist.STORAGE_KEY);
    expect((JSON.parse(json) as AppState).decks[0].name).toBe('変更後のデッキ');
    expect(screen.getByRole('status')).toHaveTextContent('saved');
    view.unmount();
    fireEvent(window, new Event('pagehide'));
    fireEvent(document, new Event('visibilitychange'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('退避に失敗して保存を停止した場合は離脱イベントでも元データを上書きしない', () => {
    const storage = { getItem: () => '{broken', setItem: vi.fn(() => { throw new Error('保存領域を使用できません'); }) };
    render(<AppStateProvider storage={storage}><RecoveryHarness broken={false} /></AppStateProvider>);
    const backupAttempts = storage.setItem.mock.calls.length;
    fireEvent.click(screen.getByText('変更'));
    fireEvent(window, new Event('pagehide'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    expect(storage.setItem).toHaveBeenCalledTimes(backupAttempts);
    expect(screen.getByRole('status')).toHaveTextContent('failed');
  });
});

describe('空状態と出典', () => {
  it('入力欄へフォーカスを移し、グループ・パターン・結果の案内と生成日時を表示する', async () => {
    const user = userEvent.setup();
    render(<App db={db} storage={{ getItem: () => null, setItem: () => {} }} />);
    expect(screen.getByText('デッキを取り込むか、カードを追加してください。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '取り込み欄へ' }));
    expect(screen.getByLabelText('デッキリストまたはブックマークレットの JSON を貼り付け')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'カード検索へ' }));
    expect(screen.getByRole('combobox', { name: 'カードを検索' })).toHaveFocus();
    await user.click(screen.getByRole('tab', { name: 'カードグループ' }));
    expect(screen.getByText(/カードグループを作ると/)).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '初動パターン' }));
    expect(screen.getByText(/先に「カードグループ」タブ/)).toHaveTextContent('特定のカード');
    expect(screen.getByText('パターンを設定して「計算する」を押してください。')).toBeVisible();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'yaml-yugi' })).toHaveAttribute('href', 'https://github.com/DawnbrandBots/yaml-yugi');
    expect(footer).toHaveTextContent('カードテキスト © Studio Dice/SHUEISHA, TV TOKYO, KONAMI。本アプリは非公式のファンメイドツールです');
    const date = new Date(generatedAt);
    const parts = [date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()].map(value => String(value).padStart(2, '0'));
    expect(footer).toHaveTextContent(`カードDB 生成: ${date.getFullYear()}-${parts[0]}-${parts[1]} ${parts[2]}:${parts[3]}`);
  });

  it('DB読み込み前は生成日時を表示しない', () => {
    render(<App loader={createCardDbLoader(() => new Promise(() => {}))} storage={{ getItem: () => null, setItem: () => {} }} />);
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent('カードDB 生成:');
    expect(screen.getByRole('button', { name: 'カード検索へ' })).toBeDisabled();
  });
});
