import { describe, expect, it } from 'vitest';
import { validateAppState, validateCardData, validateDeck, validateFilter } from '../src/domain/validate';
import type { AppState, CardData, CardGroup, Deck, FilterNode, Pattern, Predicate, Result, Slot } from '../src/domain/types';

const card = (id = 'k1'): CardData => ({ id, name: 'カード', kind: 'monster', monsterTypes: ['effect'], text: '' });
const group = (id = 'g1'): CardGroup => ({ id, name: 'グループ', filter: { op: 'and', children: [] }, include: [], exclude: [] });
const slot = (id = 's1'): Slot => ({ id, source: { type: 'group', groupId: 'g1' }, count: 1, distinctNames: false });
const pattern = (id = 'p1'): Pattern => ({ id, name: 'パターン', enabled: true, slots: [slot()], conditions: [] });
const deck = (id = 'd1'): Deck => ({
  id, name: 'デッキ', entries: [{ cardId: 'k1', name: 'カード', section: 'main', count: 3 }],
  groups: [group()], patterns: [pattern()], effects: [], customCards: [], pageData: {}, updatedAt: 0,
});
const state = (): AppState => ({ schemaVersion: 2, decks: [deck()], activeDeckId: 'd1', settings: { customHandSize: null } });
const pred = (value: Predicate): FilterNode => ({ op: 'pred', pred: value });

function valid<T>(result: Result<T>): T {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function invalid(result: Result<unknown>, message?: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toMatch(/[ぁ-んァ-ン一-龠]/);
    if (message) expect(result.error).toContain(message);
  }
}

describe('条件式の検証', () => {
  it.each<Predicate>([
    { kind: 'cardKind', values: ['monster', 'spell', 'trap'] },
    { kind: 'monsterType', values: ['normal', 'effect', 'fusion', 'ritual', 'synchro', 'xyz', 'pendulum', 'link', 'tuner', 'flip', 'toon', 'spirit', 'union', 'gemini', 'special'], mode: 'any' },
    { kind: 'monsterType', values: [], mode: 'all' },
    { kind: 'attribute', values: ['dark', 'light', 'earth', 'water', 'fire', 'wind', 'divine'] },
    { kind: 'race', values: ['ドラゴン族', '未知の種族'] },
    { kind: 'property', values: ['normal', 'quickplay', 'continuous', 'equip', 'field', 'ritual', 'counter'] },
    { kind: 'cards', cardIds: ['k1', 'c:custom'] },
    { kind: 'nameContains', text: '名前' }, { kind: 'archetype', text: 'テーマ' },
    { kind: 'mentionsName', text: '名前' }, { kind: 'textContains', text: '効果', includePendulum: true },
  ])('述語 $kind を検証して返す', value => {
    expect(valid(validateFilter(pred(value)))).toEqual(pred(value));
  });
  it.each(['level', 'rank', 'link', 'atk', 'def', 'scale'] as const)('%s の範囲の境界・型・大小関係', kind => {
    for (const range of [{}, { min: 0 }, { max: 99999 }, { min: 0, max: 99999 }, { min: 4, max: 4 }]) {
      valid(validateFilter(pred({ kind, range })));
    }
    for (const range of [{ min: -1 }, { max: 100000 }, { min: 1.5 }, { max: NaN }, { min: Infinity }, { min: 5, max: 4 }, { min: '0' }, null, []]) {
      invalid(validateFilter({ op: 'pred', pred: { kind, range } }), 'range');
    }
  });
  it.each(['nameContains', 'textContains', 'archetype', 'mentionsName'])('%s のキーワードは1〜100文字', kind => {
    for (const size of [1, 100]) valid(validateFilter({ op: 'pred', pred: { kind, text: 'あ'.repeat(size), includePendulum: false } }));
    for (const text of ['', 'あ'.repeat(101), 1, null]) invalid(validateFilter({ op: 'pred', pred: { kind, text, includePendulum: false } }), 'text');
  });
  it('ID配列は200件まで', () => {
    valid(validateFilter(pred({ kind: 'cards', cardIds: Array.from({ length: 200 }, (_, i) => `k${i + 1}`) })));
    invalid(validateFilter(pred({ kind: 'cards', cardIds: Array(201).fill('k1') })), '200');
    for (const cardIds of [[1], [''], null]) invalid(validateFilter({ op: 'pred', pred: { kind: 'cards', cardIds } }));
  });
  it.each(['and', 'or'] as const)('%s の子は空〜50個', op => {
    valid(validateFilter({ op, children: [] }));
    valid(validateFilter({ op, children: Array.from({ length: 50 }, () => pred({ kind: 'cards', cardIds: [] })) }));
    invalid(validateFilter({ op, children: Array.from({ length: 51 }, () => pred({ kind: 'cards', cardIds: [] })) }), '50');
  });
  it('ルートを1と数えて深さ4まで', () => {
    let filter: FilterNode = pred({ kind: 'cardKind', values: ['monster'] });
    for (let i = 0; i < 3; i++) filter = { op: 'not', child: filter };
    valid(validateFilter(filter));
    invalid(validateFilter({ op: 'not', child: filter }), '深さ');
  });
  it('兄弟の部分木も含めて総ノード数100まで', () => {
    const filter: FilterNode = {
      op: 'and', children: [
        { op: 'or', children: Array.from({ length: 50 }, () => pred({ kind: 'cards', cardIds: [] })) },
        { op: 'or', children: Array.from({ length: 47 }, () => pred({ kind: 'cards', cardIds: [] })) },
      ],
    };
    valid(validateFilter(filter));
    filter.children.push(pred({ kind: 'cards', cardIds: [] }));
    invalid(validateFilter(filter), 'ノード総数');
  });
  it.each([
    null, [], {}, { op: 'xor', children: [] }, { op: 'not' }, { op: 'and', children: {} },
    { op: 'pred', pred: null }, { op: 'pred', pred: { kind: 'unknown' } },
    ...['cardKind', 'monsterType', 'attribute', 'property'].map(kind => ({ op: 'pred', pred: { kind, values: ['unknown'], mode: 'any' } })),
    { op: 'pred', pred: { kind: 'monsterType', values: ['normal'], mode: 'unknown' } },
    { op: 'pred', pred: { kind: 'cardKind', values: 'monster' } },
    { op: 'pred', pred: { kind: 'race', values: [1] } },
    { op: 'pred', pred: { kind: 'textContains', text: '効果', includePendulum: 'true' } },
  ])('不正な条件式を拒否する: %j', value => invalid(validateFilter(value)));
  it('指定されたパスをエラーに含める', () => {
    invalid(validateFilter({ op: 'unknown' }, 'テストデッキの条件'), 'テストデッキの条件');
  });
});

describe('CardDataの検証', () => {
  it('全フィールドを返し、任意値の欠落と攻守のnullを受け入れる', () => {
    valid(validateCardData(card()));
    const complete: CardData = {
      ...card(), konamiId: 1, kana: 'カード', attribute: 'light', race: 'ドラゴン族',
      level: 0, rank: 4, link: 2, atk: null, def: null, scale: 99999,
      property: 'normal', pendulumText: '', custom: true,
    };
    expect(valid(validateCardData(complete))).toEqual(complete);
    valid(validateCardData({ ...card(), kind: 'spell', monsterTypes: [], property: 'quickplay' }));
    valid(validateCardData({ ...card(), kind: 'trap', monsterTypes: [], property: 'counter' }));
  });
  it.each(['name', 'kana', 'race'] as const)('%s は1〜100文字', field => {
    for (const size of [1, 100]) valid(validateCardData({ ...card(), [field]: 'あ'.repeat(size) }));
    for (const value of ['', 'あ'.repeat(101), 1, null]) invalid(validateCardData({ ...card(), [field]: value }), field);
  });
  it.each(['text', 'pendulumText'] as const)('%s は0〜5000文字', field => {
    for (const size of [0, 5000]) valid(validateCardData({ ...card(), [field]: 'あ'.repeat(size) }));
    for (const value of ['あ'.repeat(5001), 1, null]) invalid(validateCardData({ ...card(), [field]: value }), field);
  });
  it.each(['level', 'rank', 'link', 'atk', 'def', 'scale'] as const)('%s の数値と型', field => {
    for (const value of [0, 99999]) valid(validateCardData({ ...card(), [field]: value }));
    for (const value of [-1, 100000, 0.5, NaN, Infinity, '4']) invalid(validateCardData({ ...card(), [field]: value }), field);
    if (field !== 'atk' && field !== 'def') invalid(validateCardData({ ...card(), [field]: null }), field);
  });
  it.each([
    { id: '' }, { id: 1 }, { name: undefined }, { text: undefined }, { kind: 'unknown' },
    { monsterTypes: ['unknown'] }, { monsterTypes: 'effect' }, { attribute: 'LIGHT' },
    { property: 'Quick-Play' }, { custom: 'true' }, { konamiId: 0 }, { konamiId: 1.5 },
    { konamiId: Number.MAX_SAFE_INTEGER + 1 },
  ])('不正なフィールドを拒否する: %j', fields => invalid(validateCardData({ ...card(), ...fields })));
  it.each([null, [], 1, 'カード'])('オブジェクト以外を拒否する: %j', input => invalid(validateCardData(input)));
});

describe('デッキの件数・文字数・数値', () => {
  it.each(['entries', 'groups', 'patterns', 'customCards', 'pageData'] as const)('%s は200件まで', field => {
    for (const length of [200, 201]) {
      const input = deck();
      if (field === 'entries') input.entries = Array.from({ length }, (_, i) => ({ cardId: `k${i + 1}`, name: 'カード', count: 1, section: 'main' }));
      if (field === 'groups') input.groups = Array.from({ length }, (_, i) => group(`g${i}`));
      if (field === 'patterns') input.patterns = Array.from({ length }, (_, i) => ({ ...pattern(`p${i}`), slots: [] }));
      if (field === 'customCards') input.customCards = Array.from({ length }, (_, i) => ({ ...card(`c:${i}`), custom: true }));
      if (field === 'pageData') input.pageData = Object.fromEntries(Array.from({ length }, (_, i) => [`k${i + 1}`, card(`k${i + 1}`)]));
      if (length === 200) valid(validateDeck(input));
      else invalid(validateDeck(input), '200');
    }
  });
  it.each(['include', 'exclude'] as const)('%s は200件まで', field => {
    const input = deck();
    input.groups[0][field] = Array(200).fill('k1');
    valid(validateDeck(input));
    input.groups[0][field].push('k1');
    invalid(validateDeck(input), '200');
  });
  it('スロットは8個まで', () => {
    const input = deck();
    input.patterns[0].slots = Array.from({ length: 8 }, (_, i) => slot(`s${i}`));
    valid(validateDeck(input));
    input.patterns[0].slots.push(slot('s8'));
    invalid(validateDeck(input), '8');
  });
  it.each(['deck', 'group', 'pattern'])('%sの名前は1〜50文字', field => {
    for (const length of [0, 1, 50, 51]) {
      const input = deck();
      const target = field === 'deck' ? input : field === 'group' ? input.groups[0] : input.patterns[0];
      target.name = 'あ'.repeat(length);
      if (length === 1 || length === 50) valid(validateDeck(input));
      else invalid(validateDeck(input), 'name');
    }
  });
  it('エントリ名は1〜100文字、枚数は1〜60の整数', () => {
    const input = deck();
    for (const name of ['あ', 'あ'.repeat(100)]) {
      input.entries[0].name = name;
      valid(validateDeck(input));
    }
    for (const name of ['', 'あ'.repeat(101)]) {
      input.entries[0].name = name;
      invalid(validateDeck(input), 'name');
    }
    input.entries[0].name = 'カード';
    for (const count of [1, 60]) {
      input.entries[0].count = count;
      valid(validateDeck(input));
    }
    for (const count of [0, 61, 1.5, NaN, Infinity]) {
      input.entries[0].count = count;
      invalid(validateDeck(input), '枚数');
    }
  });
  it('必要枚数は1〜5の整数', () => {
    const input = deck();
    for (const count of [1, 5]) {
      input.patterns[0].slots[0].count = count;
      valid(validateDeck(input));
    }
    for (const count of [0, 6, 1.5]) {
      input.patterns[0].slots[0].count = count;
      invalid(validateDeck(input), '必要枚数');
    }
  });
  it('60枚を超えるデッキや空デッキも保存できる', () => {
    const input = deck();
    input.entries = ['k1', 'k2'].map(cardId => ({ cardId, name: 'カード', count: 60, section: 'main' }));
    valid(validateDeck(input));
    valid(validateDeck({ ...input, entries: [], groups: [], patterns: [] }));
  });
});

describe('ID・参照・型の検証', () => {
  it.each(['groups', 'patterns', 'customCards'] as const)('%sのID重複を拒否する', field => {
    const input = deck();
    if (field === 'groups') input.groups.push(group());
    if (field === 'patterns') input.patterns.push({ ...pattern(), slots: [] });
    if (field === 'customCards') input.customCards = [{ ...card('c:1'), custom: true }, { ...card('c:1'), custom: true }];
    invalid(validateDeck(input), '重複');
  });
  it('スロットIDはパターン内・パターン間とも一意', () => {
    const input = deck();
    input.patterns[0].slots.push(slot());
    invalid(validateDeck(input), 'スロット');
    input.patterns = [pattern('p1'), pattern('p2')];
    invalid(validateDeck(input), 'スロット');
  });
  it('エントリは同じカードでも別区分なら可、同一区分の重複は不可', () => {
    const input = deck();
    input.entries.push({ ...input.entries[0], section: 'extra' }, { ...input.entries[0], section: 'side' });
    valid(validateDeck(input));
    input.entries.push({ ...input.entries[0] });
    invalid(validateDeck(input), '重複');
  });
  it('存在しないグループの参照を拒否し、未取得のカードIDは許容する', () => {
    const input = deck();
    input.patterns[0].slots[0].source = { type: 'group', groupId: 'missing' };
    invalid(validateDeck(input), 'missing');
    input.patterns[0].slots[0].source = { type: 'card', cardId: 'k999' };
    valid(validateDeck(input));
  });
  it('pageDataの値とキーを検証する', () => {
    valid(validateDeck({ ...deck(), pageData: { k1: card() } }));
    invalid(validateDeck({ ...deck(), pageData: { k2: card() } }), '一致');
    invalid(validateDeck({ ...deck(), pageData: { k1: { ...card(), kind: 'unknown' } } }), 'pageData.k1.kind');
    invalid(validateDeck({ ...deck(), pageData: [] }), 'pageData');
    invalid(validateDeck({ ...deck(), pageData: null }), 'pageData');
  });
  it.each([
    { id: '' }, { entries: null }, { groups: {} }, { patterns: 'pattern' }, { customCards: null },
    { updatedAt: -1 }, { updatedAt: Infinity }, { updatedAt: '0' },
    { entries: [{ cardId: 'k1', name: 'カード', count: '1', section: 'main' }] },
    { entries: [{ cardId: 'k1', name: 'カード', count: 1, section: 'unknown' }] },
    { groups: [{ ...group(), include: [1] }] }, { groups: [{ ...group(), exclude: [''] }] },
    { patterns: [{ ...pattern(), enabled: 1 }] },
    { patterns: [{ ...pattern(), slots: [{ ...slot(), distinctNames: 'false' }] }] },
    { patterns: [{ ...pattern(), slots: [{ ...slot(), source: { type: 'unknown' } }] }] },
    { patterns: [{ ...pattern(), slots: [{ ...slot(), source: { type: 'card' } }] }] },
  ])('不正なフィールドを拒否する: %j', fields => invalid(validateDeck({ ...deck(), ...fields })));
  it('名前・項目・エントリ番号をエラーに含める', () => {
    const input = deck();
    input.entries = [1, 2, 3].map(i => ({ cardId: `k${i}`, name: 'カード', count: i === 3 ? 0 : 1, section: 'main' }));
    const result = validateDeck(input);
    invalid(result, 'デッキ');
    invalid(result, 'entries 3.count');
    invalid(result, '1〜60');
  });
});

describe('アプリ状態と復元', () => {
  it('デッキは50個まで、空の状態も許容', () => {
    const input = state();
    input.decks = Array.from({ length: 50 }, (_, i) => deck(`d${i}`));
    valid(validateAppState(input));
    input.decks.push(deck('d50'));
    invalid(validateAppState(input), '50');
    valid(validateAppState({ ...state(), decks: [], activeDeckId: null }));
  });
  it('デッキIDの重複とactiveDeckIdの参照切れを拒否する', () => {
    invalid(validateAppState({ ...state(), decks: [deck(), deck()] }), '重複');
    invalid(validateAppState({ ...state(), activeDeckId: 'missing' }), 'activeDeckId');
    valid(validateAppState({ ...state(), activeDeckId: null }));
  });
  it('手札枚数はnullまたは1〜10の整数', () => {
    for (const value of [null, 1, 10]) valid(validateAppState({ ...state(), settings: { customHandSize: value } }));
    for (const value of [0, 11, 1.5, '5', undefined, NaN]) invalid(validateAppState({ ...state(), settings: { customHandSize: value } }), 'customHandSize');
  });
  it.each([null, [], {}, { ...state(), schemaVersion: 3 }, { ...state(), schemaVersion: '1' }, { ...state(), settings: null }, { ...state(), activeDeckId: 1 }])('不正な状態を拒否する: %j', value => invalid(validateAppState(value)));
  it('復元モードだけが参照切れのグループスロットを削除し、複数デッキの件数を返す', () => {
    const input = state();
    input.decks.push(deck('d2'));
    for (const item of input.decks) {
      item.patterns[0].slots.push(
        { ...slot('s2'), source: { type: 'group', groupId: 'missing' } },
        { ...slot('s3'), source: { type: 'card', cardId: 'k999' } },
      );
      item.patterns.push({ ...pattern('p2'), slots: [{ ...slot('s4'), source: { type: 'group', groupId: 'missing' } }] });
    }
    const original = structuredClone(input);
    invalid(validateAppState(input), '参照先');
    invalid(validateAppState(input, { dropDanglingSlots: false }), '参照先');
    const result = valid(validateAppState(input, { dropDanglingSlots: true }));
    expect(result.droppedSlots).toBe(4);
    for (const item of result.state.decks) {
      expect(item.patterns[0].slots.map(value => value.id)).toEqual(['s1', 's3']);
      expect(item.patterns[1].slots).toEqual([]);
    }
    expect(input).toEqual(original);
    expect(valid(validateAppState(state(), { dropDanglingSlots: true })).droppedSlots).toBe(0);
  });
  it('復元モードでも型・上限・ID重複や他デッキのグループ参照を見逃さない', () => {
    const input = state();
    input.decks[0].groups = [];
    input.decks.push(deck('d2'));
    expect(valid(validateAppState(input, { dropDanglingSlots: true })).droppedSlots).toBe(1);
    input.decks[0].patterns[0].slots[0].count = 0;
    invalid(validateAppState(input, { dropDanglingSlots: true }), '必要枚数');
    input.decks[0].patterns[0].slots = Array.from({ length: 9 }, (_, i) => slot(`s${i}`));
    invalid(validateAppState(input, { dropDanglingSlots: true }), '8');
    input.decks[0].patterns[0].slots = [slot(), slot()];
    invalid(validateAppState(input, { dropDanglingSlots: true }), '重複');
  });
  it('余分なキーを全階層で除き、新しいオブジェクトとして返す', () => {
    const clean = state();
    clean.decks[0].groups[0].filter = { op: 'not', child: pred({ kind: 'level', range: { min: 1 } }) };
    clean.decks[0].pageData = { k1: card() };
    clean.decks[0].customCards = [{ ...card('c:1'), custom: true }];
    function withExtras(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(withExtras);
      if (value !== null && typeof value === 'object') {
        return { ...Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withExtras(item)])), ignored: true };
      }
      return value;
    }
    // pageDataは任意キーの辞書なので、値だけに余分なフィールドを追加する。
    const input = withExtras(clean) as AppState;
    input.decks[0].pageData = { k1: { ...card(), ignored: true } as CardData };
    const output = valid(validateAppState(input)).state;
    expect(output).toEqual(clean);
    expect(output).not.toBe(input);
    expect(output.decks[0]).not.toBe(input.decks[0]);
    expect(output.decks[0].groups[0].filter).not.toBe(input.decks[0].groups[0].filter);
    expect(output.decks[0].pageData.k1).not.toBe(input.decks[0].pageData.k1);
  });
});
