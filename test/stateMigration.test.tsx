import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSaver, exportDeckJson, importDeckJson, LEGACY_STORAGE_KEY, loadState, STORAGE_KEY,
} from '../src/state/persist';
import { createReducer } from '../src/state/reducer';
import { AppStateProvider, useAppState, useSaveStatus } from '../src/state/store';
import type { PatternCondition } from '../src/domain/types';
import { validateDeck } from '../src/domain/validate';
import { createEffectsDeck, createEffectsState, groupTarget, unwrap } from './fixtures/effectsDeck';

function createStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
  };
}

function createLegacyState() {
  const state = createEffectsState();
  const decks = state.decks.map(({ effects: _, ...deck }) => ({
    ...deck, patterns: deck.patterns.map(({ conditions: __, ...pattern }) => pattern),
  }));
  return { ...state, schemaVersion: 1, decks };
}

afterEach(() => vi.useRealTimers());

describe('保存状態のv1からv2への移行', () => {
  it('v1を変更せず移行し、通常の最初の保存だけがv2に書き込む', () => {
    const storage = createStorage();
    const legacy = JSON.stringify(createLegacyState());
    storage.data.set(LEGACY_STORAGE_KEY, legacy);
    const onRead = vi.fn();
    const loaded = loadState(storage, {}, onRead);
    expect(loaded).toMatchObject({ saveBlocked: false, notice: null, state: { schemaVersion: 2 } });
    expect(loaded.state.decks[0].effects).toEqual([]);
    expect(loaded.state.decks[0].patterns[0].conditions).toEqual([]);
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith(null);
    expect(storage.setItem).not.toHaveBeenCalled();
    const saver = createSaver(storage, { storedText: onRead.mock.calls[0][0] });
    saver.schedule(loaded.state);
    saver.flush();
    expect(saver.getStatus()).toBe('saved');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(loaded.state));
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(legacy);
  });

  it('v2があればv1の読み取りも移行も行わない', () => {
    const storage = createStorage();
    const current = createEffectsState();
    storage.data.set(STORAGE_KEY, JSON.stringify(current));
    storage.data.set(LEGACY_STORAGE_KEY, '{broken');
    const onRead = vi.fn();
    expect(loadState(storage, {}, onRead)).toEqual({ state: current, notice: null, saveBlocked: false });
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith(JSON.stringify(current));
  });

  it('壊れたv2があってもv1へ戻さずv2の退避キーに保存する', () => {
    const storage = createStorage();
    storage.data.set(STORAGE_KEY, '');
    storage.data.set(LEGACY_STORAGE_KEY, JSON.stringify(createLegacyState()));
    const loaded = loadState(storage, { now: () => 7 });
    expect(loaded.notice).toContain('shodou-calc:v2:broken-7');
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(storage.data.get(`${STORAGE_KEY}:broken-7`)).toBe('');
  });

  it.each(['{broken', 'null', JSON.stringify({ ...createLegacyState(), schemaVersion: 2 }),
    JSON.stringify({ ...createLegacyState(), schemaVersion: '1' }),
  ])('読めないv1をv1の退避キーに保存し元のキーを保持する: %s', raw => {
    const storage = createStorage();
    storage.data.set(LEGACY_STORAGE_KEY, raw);
    const loaded = loadState(storage, { now: () => 123 });
    expect(loaded.saveBlocked).toBe(false);
    expect(loaded.state.schemaVersion).toBe(2);
    expect(loaded.notice).toContain('shodou-calc:v1:broken-123');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(`${LEGACY_STORAGE_KEY}:broken-123`, raw);
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });

  it('v1の退避に失敗すると元データを保持し自動保存を止める', () => {
    const storage = createStorage();
    storage.data.set(LEGACY_STORAGE_KEY, '{broken');
    storage.setItem.mockImplementation(() => { throw new Error('容量超過'); });
    const loaded = loadState(storage, { now: () => 9 });
    expect(loaded.saveBlocked).toBe(true);
    expect(loaded.notice).toContain('退避に失敗');
    storage.setItem.mockClear();
    const saver = createSaver(storage, { saveBlocked: loaded.saveBlocked, storedText: null });
    saver.schedule(loaded.state);
    saver.flush();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe('{broken');
  });

  it('移行後の初回保存より先に別タブがv2へ保存した場合は競合として止まる', () => {
    const storage = createStorage();
    const legacy = JSON.stringify(createLegacyState());
    storage.data.set(LEGACY_STORAGE_KEY, legacy);
    const onRead = vi.fn();
    const loaded = loadState(storage, {}, onRead);
    storage.data.set(STORAGE_KEY, '別タブの値');
    const saver = createSaver(storage, { storedText: onRead.mock.calls[0][0] });
    saver.schedule(loaded.state);
    saver.flush();
    expect(saver.getStatus()).toBe('conflict');
    expect(storage.data.get(STORAGE_KEY)).toBe('別タブの値');
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(legacy);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(['conditions', 'effects'] as const)('v1の%sがnullなら補完せず拒否する', field => {
    const storage = createStorage();
    const state = createEffectsState();
    const deck = state.decks[0];
    const broken = field === 'effects' ? { ...deck, effects: null }
      : { ...deck, patterns: [{ ...deck.patterns[0], conditions: null }] };
    const raw = JSON.stringify({ ...state, schemaVersion: 1, decks: [broken] });
    storage.data.set(LEGACY_STORAGE_KEY, raw);
    const loaded = loadState(storage, { now: () => 0 });
    expect(loaded.notice).toContain(field);
    expect(storage.data.get(`${LEGACY_STORAGE_KEY}:broken-0`)).toBe(raw);
  });

  it('v1に既にある条件と効果は空配列で上書きしない', () => {
    const storage = createStorage();
    const state = createEffectsState();
    storage.data.set(LEGACY_STORAGE_KEY, JSON.stringify({ ...state, schemaVersion: 1 }));
    expect(loadState(storage).state).toEqual(state);
  });

  it.each([1, 2])('v%s復元で参照切れの条件・効果を削除し、0件の種類は通知しない', version => {
    const storage = createStorage();
    const state = createEffectsState();
    state.decks[0].patterns[0].conditions.push({ kind: 'deckAtLeast', count: 1, target: { type: 'group', groupId: 'missing' } });
    state.decks[0].effects[0].steps.push({ kind: 'search', target: { type: 'group', groupId: 'missing' } });
    const raw = JSON.stringify({ ...state, schemaVersion: version });
    const key = version === 1 ? LEGACY_STORAGE_KEY : STORAGE_KEY;
    storage.data.set(key, raw);
    const loaded = loadState(storage);
    expect(loaded.notice).toBe('参照先のグループがない追加の条件を 1 件、ドロー効果を 1 件削除して復元しました。');
    expect(loaded.state.decks[0].patterns[0].conditions).toHaveLength(1);
    expect(loaded.state.decks[0].effects).toEqual([]);
    expect(storage.data.get(key)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('v1・v2のデッキファイル', () => {
  it.each([1, 2])('version %sの欠落項目を補完する', version => {
    const deck = createLegacyState().decks[0];
    const text = JSON.stringify({ format: 'shodou-calc-deck', version, deck });
    const restored = unwrap(importDeckJson(text));
    expect(restored.effects).toEqual([]);
    expect(restored.patterns[0].conditions).toEqual([]);
    expect(validateDeck(restored).ok).toBe(true);
  });

  it.each([1, 2])('version %sはnullの条件・効果を拒否する', version => {
    const deck = createEffectsDeck();
    for (const input of [{ ...deck, effects: null }, { ...deck, patterns: [{ ...deck.patterns[0], conditions: null }] }]) {
      expect(importDeckJson(JSON.stringify({ format: 'shodou-calc-deck', version, deck: input })).ok).toBe(false);
    }
  });

  it.each([1, 2])('version %sは参照切れの条件・各手順があれば全体を拒否する', version => {
    const missing = { type: 'group', groupId: 'missing' } as const;
    const deck = createEffectsDeck();
    const condition = { kind: 'deckAtLeast', target: missing, count: 1 };
    const variants = [
      { ...deck, patterns: [{ ...deck.patterns[0], conditions: [condition] }] },
      ...['search', 'excavate', 'handCost'].map(kind => ({
        ...deck, effects: [{ ...deck.effects[0], steps: [{ kind, target: missing, count: 1, destination: 'graveyard' }] }],
      })),
    ];
    for (const invalid of variants) {
      const newId = vi.fn(() => 'unused');
      const result = importDeckJson(JSON.stringify({ format: 'shodou-calc-deck', version, deck: invalid }), newId);
      expect(result.ok).toBe(false);
      expect(newId).not.toHaveBeenCalled();
    }
  });

  it('v2で書き出し、条件と手順の対象を新しいグループIDに対応させる', () => {
    const original = createEffectsDeck();
    original.patterns[0].conditions = [
      { kind: 'deckAtLeast', target: groupTarget, count: 1 },
      { kind: 'deckAfterBanish', target: groupTarget, count: 2, banish: 3 },
      { kind: 'movedIncludes', target: groupTarget, zones: ['banishedFaceUp'] },
      { kind: 'movedExcludes', target: { type: 'card', cardId: 'c:absent' }, zones: ['graveyard'] },
    ];
    original.effects[0].steps = [
      { kind: 'draw', count: 1 }, { kind: 'banishTop', count: 10 },
      { kind: 'excavate', count: 6, target: groupTarget }, { kind: 'excavate', count: 1, target: null },
      { kind: 'search', target: groupTarget }, { kind: 'handCost', target: groupTarget, destination: 'graveyard' },
    ];
    const before = structuredClone(original);
    const text = exportDeckJson(original);
    expect(JSON.parse(text)).toEqual({ format: 'shodou-calc-deck', version: 2, deck: original });
    let next = 0;
    const restored = unwrap(importDeckJson(text, () => `new-${++next}`));
    expect(restored.id).not.toBe(original.id);
    expect(restored.effects[0].id).not.toBe(original.effects[0].id);
    const target = { type: 'group', groupId: restored.groups[0].id };
    expect(restored.patterns[0].conditions).toEqual(original.patterns[0].conditions.map(condition => ({
      ...condition, target: condition.target.type === 'group' ? target : condition.target,
    })));
    expect(restored.effects[0].steps).toEqual(original.effects[0].steps.map(step => {
      if ('target' in step && step.target?.type === 'group') return { ...step, target };
      return step;
    }));
    expect(validateDeck(restored).ok).toBe(true);
    expect(original).toEqual(before);
    expect(unwrap(importDeckJson(exportDeckJson(restored))).effects[0].steps).toHaveLength(6);
  });

  it('既存のパターン作成は条件を空にし、複製は条件を独立した配列として保持する', () => {
    let next = 0;
    const reduce = createReducer({ newId: () => `new-${++next}`, now: () => 0 });
    const initial = createEffectsState();
    const created = reduce({ app: initial, lastError: null }, { type: 'pattern/create' });
    expect(created.app.decks[0].patterns[1].conditions).toEqual([]);
    const duplicated = reduce(created, { type: 'pattern/duplicate', patternId: 'p1' });
    expect(duplicated.lastError).toBeNull();
    const patterns = duplicated.app.decks[0].patterns;
    expect(patterns[2].conditions).toEqual(patterns[0].conditions);
    expect(patterns[2].conditions).not.toBe(patterns[0].conditions);
    (patterns[2].conditions[0] as Extract<PatternCondition, { kind: 'deckAtLeast' }>).count = 2;
    expect(initial.decks[0].patterns[0].conditions).toEqual(createEffectsDeck().patterns[0].conditions);
  });
});

function MigrationView() {
  const { app } = useAppState();
  const status = useSaveStatus();
  return <div>{app.schemaVersion}:{status}</div>;
}

it('Providerは移行後にv2へ自動保存し、旧キーのイベントは無視してv2のイベントで停止する', () => {
  vi.useFakeTimers();
  const storage = createStorage();
  const legacy = JSON.stringify(createLegacyState());
  storage.data.set(LEGACY_STORAGE_KEY, legacy);
  render(<AppStateProvider storage={storage}><MigrationView /></AppStateProvider>);
  expect(screen.getByText('2:pending')).toBeInTheDocument();
  fireEvent(window, new StorageEvent('storage', { key: LEGACY_STORAGE_KEY }));
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByText('2:saved')).toBeInTheDocument();
  expect(JSON.parse(storage.data.get(STORAGE_KEY)!).schemaVersion).toBe(2);
  expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(legacy);
  fireEvent(window, new StorageEvent('storage', { key: STORAGE_KEY }));
  expect(screen.getByText('2:conflict')).toBeInTheDocument();
});
