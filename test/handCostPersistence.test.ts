import { describe, expect, it } from 'vitest';
import type { EffectStep } from '../src/domain/types';
import { validateDeck } from '../src/domain/validate';
import { exportDeckJson, importDeckJson, LEGACY_STORAGE_KEY, loadState, STORAGE_KEY } from '../src/state/persist';
import { readStoredState } from '../src/state/restoreState';
import { compileCalculationDeck } from './fixtures/calculationDeck';
import { createEffectsState, unwrap } from './fixtures/effectsDeck';
import { createHandCostDeck } from './fixtures/handCostDeck';

function createState() {
  const state = createEffectsState();
  state.decks = [createHandCostDeck()];
  state.activeDeckId = state.decks[0].id;
  return state;
}
function createStorage(key: string, original: string) {
  const data = new Map([[key, original]]);
  return {
    data, getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, text: string) => { data.set(name, text); },
  };
}

describe('whenMissing の検証・保存・コンパイル', () => {
  it.each([
    ['graveyard', 'graveyard'], ['graveyard', 'banishedFaceUp'],
    ['banishedFaceUp', 'graveyard'], ['banishedFaceUp', 'banishedFaceUp'],
  ] as const)('通常の行き先 %s と対象無しの行き先 %s は独立に保持する', (destination, whenMissing) => {
    const state = createState();
    const deck = state.decks[0];
    const step: EffectStep = {
      kind: 'handCost', target: { type: 'group', groupId: 'dark' }, destination, whenMissing,
    };
    deck.effects[0].steps[1] = step;
    expect(unwrap(validateDeck(deck))).toStrictEqual(deck);
    const json = exportDeckJson(deck);
    expect(JSON.parse(json).version).toBe(2);
    let id = 0;
    const imported = unwrap(importDeckJson(json, () => `new-${id++}`));
    expect(imported.effects[0].steps[1]).toStrictEqual({
      ...step, target: { type: 'group', groupId: imported.groups[1].id },
    });
    const loaded = loadState(createStorage(STORAGE_KEY, JSON.stringify(state)));
    expect(loaded).toStrictEqual({ state, notice: null, saveBlocked: false });
    const calculation = compileCalculationDeck(deck);
    if (calculation.mode !== 'simulation') throw new Error('シミュレーション入力が必要');
    const compiledStep = calculation.input.effects[0].steps[1];
    expect(compiledStep).toStrictEqual({ kind: 'handCost', members: [1], destination, whenMissing });
    expect(Object.hasOwn(compiledStep, 'whenMissing')).toBe(true);
    const importedCalculation = compileCalculationDeck(imported);
    if (importedCalculation.mode !== 'simulation') throw new Error('シミュレーション入力が必要');
    expect(importedCalculation.input.effects).toStrictEqual(calculation.input.effects);
  });

  it.each([null, 'banishedFaceDown', 'unknown', '', 0, 1, false, {}, []])(
    '不正な値 %j はデッキファイルと保存状態の全体を拒否する', whenMissing => {
      const state = createState();
      const deck = state.decks[0];
      const invalid = { ...deck, effects: [{ ...deck.effects[0], steps: [
        deck.effects[0].steps[0], { ...deck.effects[0].steps[1], whenMissing },
      ] }] };
      const stored = JSON.stringify({ ...state, decks: [{ ...deck, id: 'valid' }, invalid] });
      const results = [
        importDeckJson(JSON.stringify({ format: 'shodou-calc-deck', version: 2, deck: invalid })),
        readStoredState(stored, false),
      ];
      for (const result of results) {
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('不正な値を受け付けた');
        expect(result.error).toContain('計算接続');
        expect(result.error).toContain('.effects 1.steps 2.whenMissing: 値は graveyard / banishedFaceUp のいずれかで指定してください');
      }
      const storage = createStorage(STORAGE_KEY, stored);
      const loaded = loadState(storage, { newId: () => 'new', now: () => 17 });
      expect(loaded.state.decks.map(item => item.id)).toEqual(['new']);
      expect(loaded.notice).toContain('.whenMissing');
      expect(storage.data.get(`${STORAGE_KEY}:broken-17`)).toBe(stored);
      expect(storage.data.get(STORAGE_KEY)).toBe(stored);
    },
  );

  it.each([1, 2])('whenMissing の無い v%s のファイルと保存状態を読める', version => {
    const state = createState();
    const deck = state.decks[0];
    const file = JSON.stringify({ format: 'shodou-calc-deck', version, deck });
    let id = 0;
    const imported = unwrap(importDeckJson(file, () => `new-${id++}`));
    const original = JSON.stringify({ ...state, schemaVersion: version });
    const key = version === 1 ? LEGACY_STORAGE_KEY : STORAGE_KEY;
    const storage = createStorage(key, original);
    const loaded = loadState(storage);
    expect(loaded).toStrictEqual({ state, notice: null, saveBlocked: false });
    expect(storage.data.get(key)).toBe(original);
    for (const restored of [imported, loaded.state.decks[0]]) {
      expect(Object.hasOwn(restored.effects[0].steps[1], 'whenMissing')).toBe(false);
      const calculation = compileCalculationDeck(restored);
      if (calculation.mode !== 'simulation') throw new Error('シミュレーション入力が必要');
      const step = calculation.input.effects[0].steps[1];
      expect(step).toStrictEqual({ kind: 'handCost', destination: 'banishedFaceUp', members: [1] });
      expect(Object.hasOwn(step, 'whenMissing')).toBe(false);
    }
  });

  it('v1 の効果と条件が無いデータも従来どおり空配列を補う', () => {
    const state = createState();
    const { effects: _, ...deck } = state.decks[0];
    const legacyDeck = { ...deck, patterns: deck.patterns.map(({ conditions: __, ...pattern }) => pattern) };
    const file = JSON.stringify({ format: 'shodou-calc-deck', version: 1, deck: legacyDeck });
    let id = 0;
    const imported = unwrap(importDeckJson(file, () => `new-${id++}`));
    const original = JSON.stringify({ ...state, schemaVersion: 1, decks: [legacyDeck] });
    const loaded = loadState(createStorage(LEGACY_STORAGE_KEY, original));
    expect(loaded.notice).toBeNull();
    for (const restored of [imported, loaded.state.decks[0]]) {
      expect(restored.effects).toEqual([]);
      expect(restored.patterns[0].conditions).toEqual([]);
    }
  });

  it('検証で undefined の項目を残さない', () => {
    const deck = createHandCostDeck();
    const step = deck.effects[0].steps[1];
    const parsed = unwrap(validateDeck({ ...deck, effects: [{ ...deck.effects[0], steps: [
      deck.effects[0].steps[0], { ...step, whenMissing: undefined },
    ] }] }));
    expect(parsed).toStrictEqual(deck);
    expect(Object.hasOwn(parsed.effects[0].steps[1], 'whenMissing')).toBe(false);
  });
});
