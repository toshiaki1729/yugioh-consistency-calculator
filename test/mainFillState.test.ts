import { describe, expect, it } from 'vitest';
import { getMainFillCount } from '../src/domain/mainFill';
import type { AppState, Deck, Result } from '../src/domain/types';
import { validateAppState, validateDeck } from '../src/domain/validate';
import { createInitialState, createReducer } from '../src/state/reducer';
import type { Action, ReducerState } from '../src/state/reducer';
import { createSaver, exportDeckJson, importDeckJson, loadState, STORAGE_KEY } from '../src/state/persist';

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function initial(): AppState {
  return createInitialState({ newId: () => 'deck', now: () => 0 });
}

function expectAbsent(deck: Deck) {
  expect(Object.hasOwn(deck, 'mainFillTarget')).toBe(false);
  expect(exportDeckJson(deck)).not.toContain('mainFillTarget');
}

describe('補う枚数の共通計算', () => {
  it.each([
    [35, undefined, 0], [35, 40, 5], [3, 40, 37], [0, 60, 60],
    [40, 40, 0], [50, 40, 0], [60, 60, 0], [61, 60, 0],
  ])('M=%s、T=%s は %s 枚補う', (mainCount, target, expected) => {
    expect(getMainFillCount(mainCount!, target)).toBe(expected);
  });
});

describe('補充設定の入力検証と互換', () => {
  it.each([39, 61, 40.5, '40', null])('%s は復元とデッキファイルの全体を拒否する', target => {
    const app = initial();
    const deck = { ...app.decks[0], mainFillTarget: target };
    const stored = { ...app, decks: [app.decks[0], { ...deck, id: 'invalid' }] };
    for (const result of [
      validateDeck(deck),
      validateAppState(stored, { dropDanglingSlots: true }),
      importDeckJson(JSON.stringify({ format: 'shodou-calc-deck', version: 2, deck })),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('不正な値を受け付けた');
      expect(result.error).toContain('新しいデッキ');
      expect(result.error).toContain('.mainFillTarget: 補う枚数は 40〜60 の整数で指定してください');
    }
  });

  it.each(Array.from({ length: 21 }, (_, index) => 40 + index))('%s を保存・読み込みできる', target => {
    const app = initial();
    app.decks[0].mainFillTarget = target;
    expect(value(validateAppState(app)).state.decks[0].mainFillTarget).toBe(target);
    const json = exportDeckJson(app.decks[0]);
    expect(JSON.parse(json).version).toBe(2);
    expect(value(importDeckJson(json, () => 'loaded')).mainFillTarget).toBe(target);
    const data = new Map([[STORAGE_KEY, JSON.stringify(app)]]);
    const loaded = loadState({
      getItem: key => data.get(key) ?? null,
      setItem: (key, text) => { data.set(key, text); },
    });
    expect(loaded.state.schemaVersion).toBe(2);
    expect(loaded.state.decks[0].mainFillTarget).toBe(target);
  });

  it.each([1, 2])('設定のない v%s ファイルと localStorage は設定なしを保つ', version => {
    const app = initial();
    const deck = app.decks[0];
    const storedDeck: Partial<Deck> = structuredClone(deck);
    if (version === 1) delete storedDeck.effects;
    const file = JSON.stringify({ format: 'shodou-calc-deck', version, deck: storedDeck });
    expectAbsent(value(importDeckJson(file, () => 'loaded')));
    const key = version === 1 ? 'shodou-calc:v1' : STORAGE_KEY;
    const original = JSON.stringify({ ...app, schemaVersion: version, decks: [storedDeck] });
    const data = new Map([[key, original]]);
    const storage = {
      getItem: name => data.get(name) ?? null,
      setItem: (name, text) => { data.set(name, text); },
    } satisfies Parameters<typeof loadState>[0];
    const loaded = loadState(storage);
    expect(loaded.saveBlocked).toBe(false);
    expect(loaded.state.schemaVersion).toBe(2);
    expectAbsent(loaded.state.decks[0]);
    expect(data.get(key)).toBe(original);
    if (version === 1) {
      const saver = createSaver(storage);
      saver.schedule(loaded.state);
      saver.flush();
      const migrated = JSON.parse(data.get(STORAGE_KEY)!);
      expect(migrated.schemaVersion).toBe(2);
      expectAbsent(migrated.decks[0]);
      expect(data.get(key)).toBe(original);
    }
  });
});

describe('補充設定の状態操作', () => {
  const reducer = createReducer({ newId: () => 'new-deck', now: () => 123 });
  function state(target?: number): ReducerState {
    const app = initial();
    if (target !== undefined) app.decks[0].mainFillTarget = target;
    return { app, lastError: null };
  }

  it.each([40, 50, 60])('%s に変更し、null でプロパティそのものを削除する', target => {
    const original = state();
    const set = reducer(original, { type: 'deck/setMainFillTarget', target });
    expect(set.lastError).toBeNull();
    expect(set.app.decks[0].mainFillTarget).toBe(target);
    expectAbsent(original.app.decks[0]);
    const cleared = reducer(set, { type: 'deck/setMainFillTarget', target: null });
    expect(cleared.lastError).toBeNull();
    expectAbsent(cleared.app.decks[0]);
  });

  it.each([39, 61, 40.5, NaN, Infinity, '40', undefined])('%s は状態を変えずエラーにする', target => {
    const original = state(45);
    const action = { type: 'deck/setMainFillTarget', target } as Action;
    const result = reducer(original, action);
    expect(result.lastError).toBe('補う枚数は 40〜60 の整数で指定してください');
    expect(result.app).toBe(original.app);
    expect(original.app.decks[0].mainFillTarget).toBe(45);
  });

  it('複製に設定を引き継ぐ', () => {
    const result = reducer(state(47), { type: 'deck/duplicate' });
    expect(result.lastError).toBeNull();
    expect(result.app.decks.map(deck => deck.mainFillTarget)).toEqual([47, 47]);
    expect(result.app.decks[1].id).not.toBe(result.app.decks[0].id);
  });

  it.each(['new', 'replace'] as const)('カード取り込み %s の設定を保つ', mode => {
    const result = reducer(state(47), {
      type: 'import/apply', mode, deckName: '取り込み',
      entries: [{ cardId: 'k1', name: 'A', count: 3, section: 'main' }], pageData: {},
    });
    expect(result.lastError).toBeNull();
    const imported = result.app.decks.find(deck => deck.id === result.app.activeDeckId)!;
    expect(imported.entries).toHaveLength(1);
    if (mode === 'new') expectAbsent(imported);
    else expect(imported.mainFillTarget).toBe(47);
  });

  it('デッキファイルの取り込みではファイルの設定を保持する', () => {
    const fileDeck = { ...initial().decks[0], mainFillTarget: 58 };
    const imported = value(importDeckJson(exportDeckJson(fileDeck), () => 'file-deck'));
    const result = reducer(state(47), { type: 'deck/import', deck: imported });
    expect(result.lastError).toBeNull();
    expect(result.app.decks.map(deck => deck.mainFillTarget)).toEqual([47, 58]);
  });
});
