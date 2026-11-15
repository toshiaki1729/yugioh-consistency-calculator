import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as persist from '../src/state/persist';
import { createInitialState } from '../src/state/reducer';
import { AppStateProvider, useDispatch } from '../src/state/store';
import { DeckHeader } from '../src/ui/layout/DeckHeader';
import { ErrorBoundary } from '../src/ui/layout/ErrorBoundary';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function EditableHeader() {
  const dispatch = useDispatch();
  return <>
    <DeckHeader />
    <button onClick={() => dispatch({ type: 'deck/rename', name: '競合後の編集' })}>変更</button>
  </>;
}

function BrokenView(): never {
  throw new Error('表示テストの例外');
}

describe('他のタブの更新と保存案内', () => {
  it('値を保持するストレージでは StrictMode の初回保存後も連続して保存できる', () => {
    vi.useFakeTimers();
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    };
    render(<StrictMode><AppStateProvider storage={storage}><EditableHeader /></AppStateProvider></StrictMode>);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('status')).toHaveTextContent('保存済み');
    const previousWrites = storage.setItem.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '変更' }));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('status')).toHaveTextContent('保存済み');
    expect(storage.setItem).toHaveBeenCalledTimes(previousWrites + 1);
    expect(JSON.parse(data.get(persist.STORAGE_KEY)!).decks[0].name).toBe('競合後の編集');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([persist.STORAGE_KEY, null])('storage の key=%s で保存を止め、編集の保持・書き出し・再読み込みを提供する', key => {
    vi.useFakeTimers();
    const download = vi.spyOn(persist, 'downloadDeck').mockImplementation(() => {});
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => {});
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const storage = { getItem: () => null, setItem: vi.fn() };
    const view = render(<AppStateProvider storage={storage}><EditableHeader /></AppStateProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('保存待ち');
    fireEvent(window, new StorageEvent('storage', { key }));
    expect(screen.getByRole('status')).toHaveTextContent('別のタブで更新されました');
    expect(screen.getByRole('status')).toHaveClass('DeckHeader-error');
    expect(screen.getByRole('alert')).toHaveTextContent('このタブの自動保存を止めました');
    expect(screen.getByRole('alert')).toHaveTextContent('再読み込みすると最新のデータを表示します');
    expect(screen.getByRole('alert')).toHaveTextContent('先に JSON で書き出してください');
    fireEvent.click(screen.getByRole('button', { name: '変更' }));
    fireEvent.click(screen.getByRole('button', { name: 'JSON 書き出し' }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ name: '競合後の編集' }));
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent(window, new Event('pagehide'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('status')).toHaveTextContent('別のタブで更新されました');
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(reload).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('無関係なキーのイベントでは保存を止めない', () => {
    vi.useFakeTimers();
    const storage = { getItem: () => null, setItem: vi.fn() };
    render(<AppStateProvider storage={storage}><DeckHeader /></AppStateProvider>);
    fireEvent(window, new StorageEvent('storage', { key: 'other-key' }));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('status')).toHaveTextContent('保存済み');
    expect(screen.queryByRole('button', { name: '再読み込み' })).not.toBeInTheDocument();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('Error Boundary は conflict を未保存の可能性として案内する', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const download = vi.spyOn(persist, 'downloadDeck').mockImplementation(() => {});
    const deck = createInitialState().decks[0];
    render(<ErrorBoundary activeDeck={deck} saveStatus="conflict"><BrokenView /></ErrorBoundary>);
    expect(screen.getByText('最後の変更が保存されていない可能性があります。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '現在のデッキを JSON で書き出す' }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(deck);
  });
});
