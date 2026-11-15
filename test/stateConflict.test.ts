import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSaver, loadState, STORAGE_KEY } from '../src/state/persist';
import { createInitialState } from '../src/state/reducer';

function createStorage(original: string | null = null) {
  const data = new Map<string, string>();
  if (original !== null) data.set(STORAGE_KEY, original);
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
  };
}

function createSession(storage: ReturnType<typeof createStorage>) {
  let storedText: string | null = null;
  const loaded = loadState(storage, {}, text => { storedText = text; });
  return { ...loaded, saver: createSaver(storage, { storedText, saveBlocked: loaded.saveBlocked }) };
}

afterEach(() => { vi.useRealTimers(); });

describe('保存の競合検知', () => {
  it.each([null, JSON.stringify(createInitialState())])('起点 %s を共有する古いタブは先に保存された内容を上書きしない', original => {
    const storage = createStorage(original);
    const first = createSession(storage);
    const second = createSession(storage);
    first.state.decks[0].name = 'タブ A の変更';
    second.state.decks[0].name = 'タブ B の変更';
    first.saver.schedule(first.state);
    first.saver.flush();
    second.saver.schedule(second.state);
    second.saver.flush();
    expect(first.saver.getStatus()).toBe('saved');
    expect(second.saver.getStatus()).toBe('conflict');
    expect(second.saver.getError()).toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.data.get(STORAGE_KEY)).toBe(JSON.stringify(first.state));
  });

  it('競合を通知した後は予約済みタイマー・schedule・flush が書き込まない', () => {
    vi.useFakeTimers();
    const storage = createStorage();
    const { state, saver } = createSession(storage);
    const listener = vi.fn();
    saver.subscribe(listener);
    saver.schedule(state);
    saver.markConflict();
    saver.markConflict();
    saver.schedule({ ...state, settings: { customHandSize: 7 } });
    saver.flush();
    vi.advanceTimersByTime(1000);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(saver.getStatus()).toBe('conflict');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('同じタブの連続した保存は自分の書き込みを競合と判定しない', () => {
    vi.useFakeTimers();
    const storage = createStorage();
    const { state, saver } = createSession(storage);
    for (const name of ['1 回目', '2 回目', '3 回目']) {
      state.decks[0].name = name;
      saver.schedule(state);
      vi.advanceTimersByTime(500);
      expect(saver.getStatus()).toBe('saved');
      expect(storage.data.get(STORAGE_KEY)).toBe(JSON.stringify(state));
    }
    expect(storage.setItem).toHaveBeenCalledTimes(3);
  });

  it('保存直前の照合で検知した競合も後の保存を停止する', () => {
    vi.useFakeTimers();
    const storage = createStorage();
    const { state, saver } = createSession(storage);
    saver.schedule(state);
    const other = JSON.stringify({ ...state, settings: { customHandSize: 8 } });
    storage.data.set(STORAGE_KEY, other);
    vi.advanceTimersByTime(500);
    expect(saver.getStatus()).toBe('conflict');
    saver.schedule(state);
    saver.flush();
    vi.advanceTimersByTime(500);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.data.get(STORAGE_KEY)).toBe(other);
  });

  it('復元時の元の文字列を使い、再整形による誤検知や起動後の読み直しをしない', () => {
    const original = JSON.stringify(createInitialState(), null, 2);
    const storage = createStorage(original);
    const onRead = vi.fn();
    const loaded = loadState(storage, {}, onRead);
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith(original);
    storage.data.set(STORAGE_KEY, JSON.stringify(createInitialState()));
    const saver = createSaver(storage, { storedText: onRead.mock.calls[0][0] });
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    saver.schedule(loaded.state);
    saver.flush();
    expect(saver.getStatus()).toBe('conflict');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('壊れた元データの退避後は元の文字列を起点に初期状態を保存する', () => {
    const storage = createStorage('{broken');
    const { state, saver } = createSession(storage);
    expect(storage.data.get(STORAGE_KEY)).toBe('{broken');
    saver.schedule(state);
    saver.flush();
    expect(saver.getStatus()).toBe('saved');
    expect(storage.data.get(STORAGE_KEY)).toBe(JSON.stringify(state));
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem.mock.calls[0][1]).toBe('{broken');
  });

  it('退避失敗による保存停止は競合通知後も failed のまま維持する', () => {
    const storage = createStorage('{broken');
    storage.setItem.mockImplementation(() => { throw new Error('容量超過'); });
    const { state, saver, saveBlocked } = createSession(storage);
    expect(saveBlocked).toBe(true);
    saver.markConflict();
    saver.schedule(state);
    saver.flush();
    expect(saver.getStatus()).toBe('failed');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.data.get(STORAGE_KEY)).toBe('{broken');
  });

  it('照合の読み取り失敗は failed にし、書き込みを行わない', () => {
    const storage = createStorage();
    const { state, saver } = createSession(storage);
    storage.getItem.mockImplementation(() => { throw new Error('読み取り拒否'); });
    saver.schedule(state);
    saver.flush();
    expect(saver.getStatus()).toBe('failed');
    expect(saver.getError()).toContain('読み取り拒否');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('起点を省略した saver の初回読み取り失敗も保存を停止する', () => {
    const storage = createStorage();
    storage.getItem.mockImplementation(() => { throw new Error('読み取り拒否'); });
    const saver = createSaver(storage);
    saver.schedule(createInitialState());
    saver.flush();
    expect(saver.getStatus()).toBe('failed');
    expect(saver.getError()).toContain('読み取り拒否');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
