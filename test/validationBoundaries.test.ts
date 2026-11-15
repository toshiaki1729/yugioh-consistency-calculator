import { describe, expect, it, vi } from 'vitest';
import { createUniqueArrayDecoder } from '../src/domain/decoder';
import { attributeLabels, cardKindLabels, monsterTypeLabels, spellTrapPropertyLabels } from '../src/domain/labels';
import { MAX_RACE_VALUES } from '../src/domain/limits';
import type { AppState, CardData, Deck, Result } from '../src/domain/types';
import { validateAppState, validateCardData, validateDeck, validateFilter } from '../src/domain/validate';
import { createCardDb } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import { decodePayload, encodePayload, validatePayload } from '../src/importer/payload';
import { resolveImport } from '../src/importer/resolve';
import { createEmptyDeck, createInitialState, createReducer } from '../src/state/reducer';
import type { ReducerState } from '../src/state/reducer';
import { exportDeckJson, importDeckJson, loadState, STORAGE_KEY } from '../src/state/persist';
import sample from './fixtures/yaml-yugi-sample.json';

const card = (id = 'k1'): CardData => ({
  id, name: 'カード', kind: 'monster', monsterTypes: ['effect'], text: '',
});
const makeDeck = (): Deck => ({
  ...createEmptyDeck({ newId: () => 'd1', now: () => 0 }, '境界テスト'),
  entries: [{ cardId: 'k1', name: 'カード', count: 1, section: 'main' }],
  groups: [{ id: 'g1', name: '対象', filter: { op: 'and', children: [] }, include: [], exclude: [] }],
  patterns: [{ id: 'p1', name: '初動', enabled: true, slots: [
    { id: 's1', source: { type: 'card', cardId: 'k1' }, count: 1, distinctNames: false },
  ] }],
});
const makeState = (deck: Deck): AppState => ({
  schemaVersion: 1, decks: [deck], activeDeckId: deck.id, settings: { customHandSize: null },
});

function valid<T>(result: Result<T>): T {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function invalid(result: Result<unknown>, path: string, reason?: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain(path);
  expect(result.error).toMatch(/[ぁ-んァ-ン一-龠]/);
  if (reason) expect(result.error).toContain(reason);
}

const cardIdFields: [string, (deck: Deck, id: string) => void][] = [
  ['entries 1.cardId', (deck, id) => { deck.entries[0].cardId = id; }],
  ['include 1', (deck, id) => { deck.groups[0].include = [id]; }],
  ['exclude 1', (deck, id) => { deck.groups[0].exclude = [id]; }],
  ['cardIds 1', (deck, id) => { deck.groups[0].filter = { op: 'pred', pred: { kind: 'cards', cardIds: [id] } }; }],
  ['source.cardId', (deck, id) => { deck.patterns[0].slots[0].source = { type: 'card', cardId: id }; }],
  ['customCards 1.id', (deck, id) => { deck.customCards = [{ ...card(id), custom: true }]; }],
  ['pageData.', (deck, id) => { deck.pageData = JSON.parse(`{${JSON.stringify(id)}:${JSON.stringify(card())}}`); }],
  ['pageData.k1.id', (deck, id) => { deck.pageData = { k1: card(id) }; }],
];
const badCardIds = [
  'toString', '__proto__', 'constructor', '', 'k', 'k0', 'k01', 'k-1', 'k+1', 'k1.0',
  'k1e3', 'k9007199254740992', 'k9007199254740993', 'k999999999999999999999',
  ' k1', 'k1 ', 'k1\n', 'k１', 'K1', 'c:', 'c:あ', 'c:a b', 'c:a\n', 'c:a.b',
  'c:' + 'a'.repeat(65),
];

describe.each(cardIdFields)('カード ID の入力境界: %s', (path, setId) => {
  it.each(badCardIds)('不正な ID %j をデッキ全体のエラーとして返す', id => {
    const deck = makeDeck();
    setId(deck, id);
    const input = JSON.parse(JSON.stringify(deck));
    const before = JSON.stringify(input);
    invalid(validateDeck(input), path, 'カード ID');
    invalid(validateAppState(makeState(input), { dropDanglingSlots: true }), path, 'カード ID');
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('カード ID と格納先の規則', () => {
  const officialIds = ['k1', 'k9007199254740990', 'k9007199254740991'];
  const customIds = ['c:a', 'c:0', 'c:Az09_-', 'c:' + 'a'.repeat(64)];

  it.each([...officialIds, ...customIds])('有効な ID %s を共通項目で受け入れる', id => {
    valid(validateCardData(card(id)));
    for (const [, setId] of cardIdFields.slice(0, 5)) {
      const deck = makeDeck();
      setId(deck, id);
      valid(validateDeck(deck));
    }
  });

  it.each(customIds)('カスタムカード %s は custom: true なら受け入れる', id => {
    valid(validateDeck({ ...makeDeck(), customCards: [{ ...card(id), custom: true }] }));
  });

  it.each([false, undefined])('カスタムカードの custom: %j は拒否する', custom => {
    invalid(validateDeck({ ...makeDeck(), customCards: [{ ...card('c:a'), custom }] }),
      'customCards 1.custom', 'true');
  });

  it.each([true, false, undefined])('公式 ID のカスタムカードは custom: %j でも拒否する', custom => {
    invalid(validateDeck({ ...makeDeck(), customCards: [{ ...card(), custom }] }),
      'customCards 1.id', 'c:');
  });

  it.each(officialIds)('補助データ %s は custom の省略と false を受け入れる', id => {
    for (const custom of [undefined, false]) {
      valid(validateDeck({ ...makeDeck(), pageData: { [id]: { ...card(id), custom } } }));
    }
  });

  it('補助データのカスタム ID・キー不一致・custom: true を拒否する', () => {
    invalid(validateDeck({ ...makeDeck(), pageData: { 'c:a': card('c:a') } }), 'pageData.c:a', 'k と数字');
    invalid(validateDeck({ ...makeDeck(), pageData: { k1: card('c:a') } }), 'pageData.k1', '一致');
    invalid(validateDeck({ ...makeDeck(), pageData: { k1: card('k2') } }), 'pageData.k1', '一致');
    invalid(validateDeck({ ...makeDeck(), pageData: { k1: { ...card(), custom: true } } }),
      'pageData.k1.custom', 'true');
  });

  it('内部のデッキ・グループ・パターン・スロット ID の規則は変更しない', () => {
    const deck = makeDeck();
    deck.id = 'toString';
    deck.groups[0].id = '__proto__';
    deck.patterns[0].id = 'constructor';
    deck.patterns[0].slots[0].id = '内部 ID';
    deck.patterns[0].slots[0].source = { type: 'group', groupId: '__proto__' };
    valid(validateAppState(makeState(deck)));
  });
});

const choices = [
  ['cardKind', Object.keys(cardKindLabels)],
  ['monsterType', Object.keys(monsterTypeLabels)],
  ['attribute', Object.keys(attributeLabels)],
  ['property', Object.keys(spellTrapPropertyLabels)],
  ['race', Array.from({ length: 30 }, (_, index) => `種族${index}`)],
] as const;

describe.each(choices)('条件の値の上限と重複: %s', (kind, options) => {
  const filter = (values: unknown) => ({ op: 'pred', pred: { kind, values, mode: 'any' } });

  it('空・1 件・上限ちょうどを受け入れる', () => {
    for (const values of [[], options.slice(0, 1), [...options]]) valid(validateFilter(filter(values)));
  });

  it('上限内でも重複を拒否する', () => {
    invalid(validateFilter(filter([options[0], options[0]])), 'pred.values', '値が重複');
  });

  it('上限を超えた配列を拒否する', () => {
    invalid(validateFilter(filter([...options, options[0]])), 'pred.values', '上限');
  });
});

describe('配列の検証順とカード本体', () => {
  it('10 万要素の race.values は先頭要素にもアクセスせずに拒否する', () => {
    const values = Array(100_000).fill('ドラゴン族');
    const readFirst = vi.fn(() => 'ドラゴン族');
    Object.defineProperty(values, 0, { get: readFirst });
    invalid(validateFilter({ op: 'pred', pred: { kind: 'race', values } }), 'values', '上限（30）');
    expect(readFirst).not.toHaveBeenCalled();
    expect(MAX_RACE_VALUES).toBe(30);
  });

  it('上限判定は要素デコーダを呼ぶ前に行う', () => {
    const decode = vi.fn((value: unknown): Result<string> => ({ ok: true, value: String(value) }));
    invalid(createUniqueArrayDecoder(decode, 1)(['a', 'b'], '配列'), '配列', '上限');
    expect(decode).not.toHaveBeenCalled();
  });

  it('種族名の文字数検証と完全一致での重複判定を維持する', () => {
    valid(validateFilter({ op: 'pred', pred: { kind: 'race', values: ['未知の種族', '未知の種族 ', 'あ'.repeat(100)] } }));
    for (const value of ['', 'あ'.repeat(101), 1]) {
      invalid(validateFilter({ op: 'pred', pred: { kind: 'race', values: [value] } }), 'values 1');
    }
  });

  it('カード本体の monsterTypes も上限と重複を検証する', () => {
    const options = Object.keys(monsterTypeLabels);
    for (const monsterTypes of [[], ['effect'], options]) valid(validateCardData({ ...card(), monsterTypes }));
    invalid(validateCardData({ ...card(), monsterTypes: ['effect', 'effect'] }), 'monsterTypes', '重複');
    invalid(validateCardData({ ...card(), monsterTypes: [...options, 'effect'] }), 'monsterTypes', '上限');
  });
});

describe('JSON ファイルと localStorage の入力境界', () => {
  it.each(['toString', '__proto__', 'constructor', 'custom-id', 'custom-flag', 'page-custom', 'race-size'])('%s を全体拒否する', scenario => {
    const deck = makeDeck();
    if (scenario === 'custom-id') deck.customCards = [{ ...card(), custom: true }];
    else if (scenario === 'custom-flag') deck.customCards = [{ ...card('c:a'), custom: false }];
    else if (scenario === 'page-custom') deck.pageData = { k1: { ...card(), custom: true } };
    else if (scenario === 'race-size') deck.groups[0].filter = { op: 'pred', pred: { kind: 'race', values: Array(100_000).fill('ドラゴン族') } };
    else deck.entries[0].cardId = scenario;
    const json = JSON.stringify(makeState(deck));
    invalid(importDeckJson(exportDeckJson(deck)), '境界テスト');
    const data = new Map([[STORAGE_KEY, json]]);
    const loaded = loadState({
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value); },
    }, { newId: () => 'fresh', now: () => 123 });
    expect(loaded.state.decks[0].entries).toEqual([]);
    expect(loaded.notice).toContain('境界テスト');
    expect(data.get(`${STORAGE_KEY}:broken-123`)).toBe(json);
    expect(data.get(STORAGE_KEY)).toBe(json);
  });
});

describe('取り込みで生成するカードの互換性', () => {
  it.each(['new', 'replace'] as const)('%s: payload の検証・URL 復号・解決・カスタム登録・JSON 往復が新しい規則を通る', mode => {
    const db = createCardDb(convertCards(sample, '2026-11-15T00:00:00.000Z').db);
    const payload = valid(validatePayload({ v: 1, source: 'neuron-bookmarklet', deckName: '取り込み', cards: [
      { cid: 12950, name: 'Ash Blossom & Joyous Spring', count: 3, section: 'main' },
      { cid: 1, name: '補助の魔法', count: 1, section: 'side', detail: { attr: '魔法' } },
      { cid: Number.MAX_SAFE_INTEGER, name: '補助のモンスター', count: 1, section: 'extra',
        detail: { attr: '水属性', species: '【 ドラゴン族 ／ チューナー／チューナー／通常 】' } },
      { name: '未解決のカード', count: 1, section: 'main' },
    ] }));
    const resolved = resolveImport(valid(decodePayload(encodePayload(payload))), db);
    expect(resolved.entries.map(entry => entry.cardId)).toEqual(['k12950', 'k1', 'k9007199254740991']);
    expect(resolved.entries[0].name).toBe('灰流うらら');
    expect(resolved.unresolved).toHaveLength(1);
    expect(resolved.pageData.k9007199254740991.monsterTypes).toEqual(['normal', 'tuner']);
    const reducer = createReducer();
    let state: ReducerState = { app: createInitialState(), lastError: null };
    state = reducer(state, {
      type: 'import/apply', mode, deckName: '取り込み', entries: resolved.entries, pageData: resolved.pageData,
      customCards: [{ card: { name: '未解決のカード', kind: 'trap', monsterTypes: [], text: '' }, count: 1, section: 'main' }],
    });
    expect(state.lastError).toBeNull();
    state = reducer(state, { type: 'customCard/add', card: { name: '手動カード', kind: 'spell', monsterTypes: [], text: '' } });
    expect(state.lastError).toBeNull();
    const deck = state.app.decks.find(item => item.id === state.app.activeDeckId)!;
    expect(deck.customCards).toHaveLength(2);
    for (const custom of deck.customCards) {
      expect(custom.id).toMatch(/^c:[A-Za-z0-9_-]{1,64}$/);
      expect(custom.custom).toBe(true);
    }
    valid(validateAppState(state.app));
    expect(valid(importDeckJson(exportDeckJson(deck))).customCards).toEqual(deck.customCards);
  });
});
