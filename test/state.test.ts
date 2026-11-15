import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState, CardData, CardGroup, Deck, DeckEntry, FilterNode, Pattern, Result, Slot } from '../src/domain/types';
import { validateAppState } from '../src/domain/validate';
import { createInitialState, createReducer } from '../src/state/reducer';
import type { Action, ReducerState } from '../src/state/reducer';
import { createSaver, exportDeckJson, importDeckFile, importDeckJson, loadState, MAX_FILE_BYTES, STORAGE_KEY } from '../src/state/persist';
import type { SaveStatus, StateStorage } from '../src/state/persist';

const card = (id = 'c:one'): CardData => ({ id, name: 'カード', kind: 'monster', monsterTypes: ['effect'], text: '', custom: true });
const entry = (cardId = 'k1', count = 3, section: DeckEntry['section'] = 'main'): DeckEntry => ({ cardId, name: 'カード', count, section });
const group = (id = 'g1'): CardGroup => ({ id, name: 'グループ', filter: { op: 'and', children: [] }, include: [], exclude: [] });
const slot = (id = 's1'): Slot => ({ id, source: { type: 'group', groupId: 'g1' }, count: 1, distinctNames: false });
const pattern = (id = 'p1', slots = [slot()]): Pattern => ({ id, name: '初動', enabled: true, slots });
const deck = (): Deck => ({
  id: 'd1', name: 'テストデッキ', entries: [entry()], groups: [group()], patterns: [pattern()],
  customCards: [card()], pageData: { k2: { ...card('k2'), custom: false } }, updatedAt: 10,
});
const app = (): AppState => ({ schemaVersion: 1, decks: [deck()], activeDeckId: 'd1', settings: { customHandSize: null } });
const ids = () => { let n = 0; return () => `new-${++n}`; };

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function harness(initial = app()) {
  let state: ReducerState = { app: initial, lastError: null };
  const reducer = createReducer({ newId: ids(), now: () => 1234 });
  return {
    get state() { return state; },
    get deck() { return state.app.decks.find(item => item.id === state.app.activeDeckId)!; },
    send(action: Action) { state = reducer(state, action); return state; },
  };
}

class FakeStorage implements StateStorage {
  data = new Map<string, string>();
  failRead = false;
  failWrite = false;
  writes: string[] = [];
  getItem(key: string): string | null {
    if (this.failRead) throw new Error('読み取り拒否');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, text: string): void {
    this.writes.push(key);
    if (this.failWrite) throw new Error('容量超過');
    this.data.set(key, text);
  }
}

afterEach(() => { vi.useRealTimers(); });

describe('カスタムカードとエントリの同時追加', () => {
  it.each(['main', 'extra', 'side'] as const)('%s に採番したカードを同じ更新で追加する', section => {
    const initial = app();
    const before = structuredClone(initial);
    const h = harness(initial);
    h.send({
      type: 'customCard/add',
      card: { name: '同時追加', kind: 'spell', monsterTypes: [], text: '' },
      addToDeck: { section, count: 3 },
    });
    expect(h.state.lastError).toBeNull();
    expect(h.deck.customCards.at(-1)).toEqual({
      id: 'c:new-1', name: '同時追加', kind: 'spell', monsterTypes: [], text: '', custom: true,
    });
    expect(h.deck.entries.at(-1)).toEqual({
      cardId: 'c:new-1', name: '同時追加', section, count: 3,
    });
    expect(h.deck.updatedAt).toBe(1234);
    expect(initial).toEqual(before);
  });

  it('addToDeck を省略した既存の操作ではエントリを追加しない', () => {
    const h = harness();
    const beforeEntries = structuredClone(h.deck.entries);
    h.send({
      type: 'customCard/add',
      card: { name: 'カードのみ', kind: 'trap', monsterTypes: [], text: '' },
    });
    expect(h.state.lastError).toBeNull();
    expect(h.deck.customCards).toHaveLength(2);
    expect(h.deck.entries).toEqual(beforeEntries);
  });

  it.each([0, 61, 1.5, NaN])('枚数 %s が不正ならカードもエントリも反映しない', count => {
    const initial = app();
    const before = structuredClone(initial);
    const h = harness(initial);
    h.send({
      type: 'customCard/add',
      card: { name: '拒否対象', kind: 'spell', monsterTypes: [], text: '' },
      addToDeck: { section: 'main', count },
    });
    expect(h.state.lastError).toContain('枚数');
    expect(h.state.app).toBe(initial);
    expect(initial).toEqual(before);
  });

  it.each(['customCards', 'entries'] as const)('%s の上限超過なら更新全体を拒否する', field => {
    const initial = app();
    if (field === 'customCards') {
      initial.decks[0].customCards = Array.from({ length: 200 }, (_, i) => card(`c:existing-${i}`));
    } else {
      initial.decks[0].entries = Array.from({ length: 200 }, (_, i) => entry(`k${i}`));
    }
    const before = structuredClone(initial);
    const h = harness(initial);
    h.send({
      type: 'customCard/add',
      card: { name: '上限超過', kind: 'spell', monsterTypes: [], text: '' },
      addToDeck: { section: 'main', count: 1 },
    });
    expect(h.state.lastError).toContain('上限');
    expect(h.state.app).toBe(initial);
    expect(initial).toEqual(before);
  });

  it('カード名が不正なら同時追加のエントリも反映しない', () => {
    const initial = app();
    const h = harness(initial);
    h.send({
      type: 'customCard/add',
      card: { name: '', kind: 'spell', monsterTypes: [], text: '' },
      addToDeck: { section: 'side', count: 2 },
    });
    expect(h.state.lastError).not.toBeNull();
    expect(h.state.app).toBe(initial);
  });
});

describe('状態の編集', () => {
  it('初回は空の「新しいデッキ」を選択し、ID と時刻を注入できる', () => {
    const state = createInitialState({ newId: () => 'first', now: () => 42 });
    expect(state).toEqual({
      schemaVersion: 1, activeDeckId: 'first', settings: { customHandSize: null },
      decks: [{ id: 'first', name: '新しいデッキ', entries: [], groups: [], patterns: [], customCards: [], pageData: {}, updatedAt: 42 }],
    });
  });

  it('デッキを作成・改名・選択・削除し、最後の削除では選択を null にする', () => {
    const h = harness();
    const original = h.state.app;
    h.send({ type: 'deck/create' });
    expect(h.deck.name).toBe('新しいデッキ');
    expect(h.deck.updatedAt).toBe(1234);
    expect(h.state.app.decks).toHaveLength(2);
    h.send({ type: 'deck/rename', name: '変更後' });
    expect(h.deck.name).toBe('変更後');
    h.send({ type: 'deck/select', deckId: 'd1' });
    expect(h.deck.updatedAt).toBe(10);
    h.send({ type: 'deck/delete' });
    expect(h.deck.name).toBe('変更後');
    h.send({ type: 'deck/delete' });
    expect(h.state.app.decks).toEqual([]);
    expect(h.state.app.activeDeckId).toBeNull();
    expect(original).toEqual(app());
    expect(h.send({ type: 'group/create' }).lastError).toContain('選択');
  });

  it('複製ではデッキ・グループ・パターン・スロットの ID と参照を振り直す', () => {
    const h = harness();
    const original = structuredClone(h.deck);
    h.send({ type: 'deck/duplicate' });
    expect(h.deck.id).not.toBe(original.id);
    expect(h.deck.groups[0].id).not.toBe('g1');
    expect(h.deck.patterns[0].id).not.toBe('p1');
    expect(h.deck.patterns[0].slots[0].id).not.toBe('s1');
    expect(h.deck.patterns[0].slots[0].source).toEqual({ type: 'group', groupId: h.deck.groups[0].id });
    expect(h.deck.customCards).toEqual(original.customCards);
    expect(h.deck.entries).toEqual(original.entries);
    expect(h.deck.updatedAt).toBe(1234);
    expect(h.state.app.decks[0]).toEqual(original);
    h.send({ type: 'deck/rename', name: 'あ'.repeat(50) });
    h.send({ type: 'deck/duplicate' });
    expect(h.deck.name).toHaveLength(50);
    expect(h.state.lastError).toBeNull();
  });

  it('同じカード・区分を合算し、区分移動先でも合算する', () => {
    const h = harness();
    h.send({ type: 'entry/add', cardId: 'k1', name: 'カード', section: 'main' });
    expect(h.deck.entries).toEqual([entry('k1', 4)]);
    h.send({ type: 'entry/add', cardId: 'k1', name: 'カード', section: 'side', count: 2 });
    expect(h.deck.entries).toHaveLength(2);
    h.send({ type: 'entry/setSection', cardId: 'k1', section: 'side', newSection: 'main' });
    expect(h.deck.entries).toEqual([entry('k1', 6)]);
    h.send({ type: 'entry/setCount', cardId: 'k1', section: 'main', count: 60 });
    expect(h.deck.entries[0].count).toBe(60);
    h.send({ type: 'entry/setCount', cardId: 'k1', section: 'main', count: 0 });
    expect(h.deck.entries).toEqual([]);
    h.send({ type: 'entry/add', cardId: 'k2', name: '別のカード', section: 'extra' });
    h.send({ type: 'entry/delete', cardId: 'k2', section: 'extra' });
    expect(h.deck.entries).toEqual([]);
    expect(h.deck.updatedAt).toBe(1234);
  });

  it('取り込みは重複を合算し、新規作成と現在デッキの置き換えを選べる', () => {
    const h = harness();
    const original = structuredClone(h.deck);
    h.send({ type: 'import/apply', mode: 'replace', deckName: '取り込み', entries: [entry('k5', 1), entry('k5', 2)], pageData: {} });
    expect(h.deck.entries).toEqual([entry('k5', 3)]);
    expect(h.deck.pageData).toEqual({});
    expect(h.deck.groups).toEqual(original.groups);
    expect(h.deck.patterns).toEqual(original.patterns);
    expect(h.deck.customCards).toEqual(original.customCards);
    expect(h.deck.name).toBe('取り込み');
    expect(h.deck.updatedAt).toBe(1234);
    h.send({ type: 'import/apply', mode: 'new', deckName: '新規取り込み', entries: [entry()], pageData: original.pageData });
    expect(h.state.app.decks).toHaveLength(2);
    expect(h.deck.groups).toEqual([]);
    expect(h.deck.patterns).toEqual([]);
    expect(h.deck.customCards).toEqual([]);
    expect(h.deck.pageData).toEqual(original.pageData);
  });

  it.each(['new', 'replace'] as const)('取り込み %s でカスタムカードと区分・枚数を原子的に追加する', mode => {
    const h = harness();
    h.send({ type: 'import/apply', mode, deckName: 'カスタム取り込み', entries: [entry()], pageData: {},
      customCards: [{ card: { name: '未収録', kind: 'trap', monsterTypes: [], text: '' }, count: 3, section: 'side' }] });
    expect(h.state.lastError).toBeNull();
    const added = h.deck.customCards.at(-1)!;
    expect(added).toMatchObject({ name: '未収録', custom: true });
    expect(added.id).toMatch(/^c:new-/);
    expect(h.deck.entries).toEqual([entry(), { cardId: added.id, name: '未収録', count: 3, section: 'side' }]);
    expect(h.deck.customCards).toHaveLength(mode === 'new' ? 1 : 2);
  });

  it('取り込みのカスタムカード上限超過で名前・エントリも含め全体を拒否する', () => {
    const initial = app();
    initial.decks[0].customCards = Array.from({ length: 200 }, (_, i) => card(`c:${i}`));
    const h = harness(initial);
    h.send({ type: 'import/apply', mode: 'replace', deckName: '変更しない', entries: [], pageData: {},
      customCards: [{ card: { name: '未収録', kind: 'trap', monsterTypes: [], text: '' }, count: 2, section: 'extra' }] });
    expect(h.state.app).toBe(initial);
    expect(h.state.lastError).toContain('上限');
  });

  it('カスタムカードを追加・編集し、カード名と pageData を更新する', () => {
    const h = harness();
    h.send({ type: 'customCard/add', card: { name: '手入力', kind: 'spell', monsterTypes: [], text: '' } });
    const added = h.deck.customCards[1];
    expect(added.id).toBe('c:new-1');
    expect(added.custom).toBe(true);
    h.send({ type: 'entry/add', cardId: added.id, name: added.name, section: 'main' });
    h.send({ type: 'customCard/edit', cardId: added.id, changes: { name: '改名', text: '効果', property: 'normal' } });
    expect(h.deck.customCards[1]).toMatchObject({ name: '改名', text: '効果', property: 'normal' });
    expect(h.deck.entries[1].name).toBe('改名');
    h.send({ type: 'pageData/update', pageData: { k3: { ...card('k3'), custom: false } } });
    expect(Object.keys(h.deck.pageData)).toEqual(['k2', 'k3']);
  });

  it('カスタムカード削除は全区分・全グループ・入れ子条件・カード指定スロットへ連鎖する', () => {
    const initial = app();
    const d = initial.decks[0];
    d.entries.push(entry('c:one'), entry('c:one', 2, 'side'), entry('c:one', 1, 'extra'));
    d.groups.push(group('g2'));
    for (const g of d.groups) {
      g.include = ['c:one', 'k1'];
      g.exclude = ['c:one', 'k2'];
      g.filter = { op: 'and', children: [
        { op: 'not', child: { op: 'pred', pred: { kind: 'cards', cardIds: ['c:one'] } } },
        { op: 'or', children: [{ op: 'pred', pred: { kind: 'cards', cardIds: ['c:one', 'k1'] } }] },
      ] };
    }
    d.patterns[0].slots.push({ ...slot('s2'), source: { type: 'card', cardId: 'c:one' } });
    d.patterns.push(pattern('p2', [{ ...slot('s3'), source: { type: 'card', cardId: 'c:one' } }]));
    const before = structuredClone(initial);
    const h = harness(initial);
    h.send({ type: 'customCard/delete', cardId: 'c:one' });
    expect(h.deck.customCards).toEqual([]);
    expect(h.deck.entries).toEqual([entry()]);
    for (const g of h.deck.groups) {
      expect(g.include).toEqual(['k1']);
      expect(g.exclude).toEqual(['k2']);
      expect(g.filter).toEqual({ op: 'and', children: [
        { op: 'not', child: { op: 'pred', pred: { kind: 'cards', cardIds: [] } } },
        { op: 'or', children: [{ op: 'pred', pred: { kind: 'cards', cardIds: ['k1'] } }] },
      ] });
    }
    expect(h.deck.patterns.map(p => p.slots)).toEqual([[slot()], []]);
    expect(initial).toEqual(before);
  });

  it('グループを作成・編集・削除し、参照スロットのみ削除する', () => {
    const h = harness();
    h.send({ type: 'group/create', name: '魔法' });
    const added = h.deck.groups[1];
    h.send({ type: 'group/edit', groupId: added.id, changes: { name: '魔法罠', filter: { op: 'pred', pred: { kind: 'cardKind', values: ['spell', 'trap'] } }, include: ['k2'], exclude: ['k3'] } });
    expect(h.deck.groups[1]).toMatchObject({ name: '魔法罠', include: ['k2'], exclude: ['k3'] });
    h.send({ type: 'slot/add', patternId: 'p1', slot: { source: { type: 'card', cardId: 'k1' }, count: 1, distinctNames: false } });
    h.send({ type: 'group/delete', groupId: 'g1' });
    expect(h.deck.groups).toHaveLength(1);
    expect(h.deck.patterns[0].slots).toHaveLength(1);
    expect(h.deck.patterns[0].slots[0].source).toEqual({ type: 'card', cardId: 'k1' });
  });

  it('グループを別IDで複製し、条件・手動設定と元の参照を保持する', () => {
    const h = harness();
    h.send({ type: 'group/edit', groupId: 'g1', changes: { name: 'あ'.repeat(50),
      filter: { op: 'not', child: { op: 'pred', pred: { kind: 'cards', cardIds: ['k1'] } } }, include: ['k2'], exclude: ['k3'] } });
    const original = structuredClone(h.deck.groups[0]);
    h.send({ type: 'group/duplicate', groupId: 'g1' });
    expect(h.state.lastError).toBeNull();
    const copy = h.deck.groups[1];
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toHaveLength(50);
    expect(copy.name.endsWith('のコピー')).toBe(true);
    expect({ ...copy, id: original.id, name: original.name }).toEqual(original);
    expect(h.deck.patterns[0].slots[0].source).toEqual({ type: 'group', groupId: 'g1' });
    h.send({ type: 'group/edit', groupId: copy.id, changes: { include: [], exclude: [], filter: { op: 'and', children: [] } } });
    expect(h.deck.groups[0]).toEqual(original);
    const before = h.state.app;
    h.send({ type: 'group/duplicate', groupId: 'missing' });
    expect(h.state.app).toBe(before);
    expect(h.state.lastError).toBe('対象のグループがありません。');
  });

  it('パターンの複製はスロットも別IDにし、対象・必要枚数・種類違い・有効状態を保持する', () => {
    const initial = app();
    initial.decks[0].patterns[0] = { ...pattern(), name: 'あ'.repeat(50), enabled: false,
      slots: [{ ...slot(), count: 2, distinctNames: true }, { ...slot('s2'), source: { type: 'card', cardId: 'k1' } }] };
    const h = harness(initial);
    const original = structuredClone(h.deck.patterns[0]);
    h.send({ type: 'pattern/duplicate', patternId: 'p1' });
    expect(h.state.lastError).toBeNull();
    const copy = h.deck.patterns[1];
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toHaveLength(50);
    expect(copy.name.endsWith('のコピー')).toBe(true);
    expect(copy.enabled).toBe(false);
    expect(new Set(h.deck.patterns.flatMap(p => p.slots.map(s => s.id))).size).toBe(4);
    expect(copy.slots.map(({ id: _, ...s }) => s)).toEqual(original.slots.map(({ id: _, ...s }) => s));
    h.send({ type: 'slot/edit', patternId: copy.id, slotId: copy.slots[0].id, changes: { count: 3 } });
    expect(h.deck.patterns[0]).toEqual(original);
    const before = h.state.app;
    h.send({ type: 'pattern/duplicate', patternId: 'missing' });
    expect(h.state.app).toBe(before);
    expect(h.state.lastError).toBe('対象のパターンがありません。');
  });

  it('パターンとスロットを編集し、有効切替・並べ替え・設定変更を行う', () => {
    const h = harness();
    h.send({ type: 'pattern/create', name: '二つ目' });
    const id = h.deck.patterns[1].id;
    h.send({ type: 'pattern/edit', patternId: id, changes: { name: '変更', enabled: false } });
    h.send({ type: 'pattern/toggle', patternId: id });
    expect(h.deck.patterns[1]).toMatchObject({ name: '変更', enabled: true });
    h.send({ type: 'slot/add', patternId: id, slot: { source: { type: 'group', groupId: 'g1' }, count: 2, distinctNames: true } });
    const slotId = h.deck.patterns[1].slots[0].id;
    h.send({ type: 'slot/edit', patternId: id, slotId, changes: { count: 3, source: { type: 'card', cardId: 'k1' } } });
    expect(h.deck.patterns[1].slots[0]).toMatchObject({ count: 3, distinctNames: true, source: { type: 'card', cardId: 'k1' } });
    h.send({ type: 'pattern/reorder', patternIds: [id, 'p1'] });
    expect(h.deck.patterns.map(p => p.id)).toEqual([id, 'p1']);
    h.send({ type: 'slot/delete', patternId: id, slotId });
    expect(h.deck.patterns[0].slots).toEqual([]);
    h.send({ type: 'pattern/delete', patternId: id });
    expect(h.deck.patterns.map(p => p.id)).toEqual(['p1']);
    h.send({ type: 'settings/setCustomHandSize', handSize: 10 });
    expect(h.state.app.settings.customHandSize).toBe(10);
    h.send({ type: 'settings/setCustomHandSize', handSize: null });
    expect(h.state.app.settings.customHandSize).toBeNull();
  });
});

describe('上限とエラー時の原子性', () => {
  it.each([
    ['デッキ', (a: AppState) => { a.decks = Array.from({ length: 50 }, (_, i) => ({ ...deck(), id: `d${i}` })); }, { type: 'deck/create' }],
    ['エントリ', (a: AppState) => { a.decks[0].entries = Array.from({ length: 200 }, (_, i) => entry(`k${i}`)); }, { type: 'entry/add', cardId: 'k201', name: '追加', section: 'main' }],
    ['グループ', (a: AppState) => { a.decks[0].groups = Array.from({ length: 200 }, (_, i) => group(`g${i}`)); }, { type: 'group/create' }],
    ['グループの複製', (a: AppState) => { a.decks[0].groups = Array.from({ length: 200 }, (_, i) => group(`g${i}`)); }, { type: 'group/duplicate', groupId: 'g1' }],
    ['パターン', (a: AppState) => { a.decks[0].patterns = Array.from({ length: 200 }, (_, i) => pattern(`p${i}`, [])); }, { type: 'pattern/create' }],
    ['パターンの複製', (a: AppState) => { a.decks[0].patterns = Array.from({ length: 200 }, (_, i) => pattern(`p${i}`, [])); }, { type: 'pattern/duplicate', patternId: 'p1' }],
    ['カスタムカード', (a: AppState) => { a.decks[0].customCards = Array.from({ length: 200 }, (_, i) => card(`c:${i}`)); }, { type: 'customCard/add', card: { name: '追加', kind: 'trap', monsterTypes: [], text: '' } }],
    ['スロット', (a: AppState) => { a.decks[0].patterns[0].slots = Array.from({ length: 8 }, (_, i) => slot(`s${i}`)); }, { type: 'slot/add', patternId: 'p1', slot: { source: { type: 'group', groupId: 'g1' }, count: 1, distinctNames: false } }],
  ] satisfies [string, (state: AppState) => void, Action][])('%s の上限を超える追加は app の参照も内容も変えない', (_, prepare, action) => {
    const initial = app();
    prepare(initial);
    expect(validateAppState(initial).ok).toBe(true);
    const before = structuredClone(initial);
    const h = harness(initial);
    h.send(action);
    expect(h.state.app).toBe(initial);
    expect(h.state.app).toEqual(before);
    expect(h.state.lastError).toContain('上限');
    h.send({ type: 'error/clear' });
    expect(h.state.lastError).toBeNull();
    expect(h.state.app).toBe(initial);
  });

  it.each<Action>([
    { type: 'entry/add', cardId: 'k1', name: 'カード', section: 'main', count: 58 },
    { type: 'entry/add', cardId: 'k1', name: 'カード', section: 'main', count: 0 },
    { type: 'entry/add', cardId: 'k1', name: 'カード', section: 'main', count: -1 },
    { type: 'entry/setCount', cardId: 'k1', section: 'main', count: 61 },
    { type: 'entry/setCount', cardId: 'k1', section: 'main', count: 1.5 },
    { type: 'settings/setCustomHandSize', handSize: 11 },
    { type: 'slot/edit', patternId: 'p1', slotId: 's1', changes: { count: 6 } },
    { type: 'slot/edit', patternId: 'p1', slotId: 's1', changes: { source: { type: 'group', groupId: 'missing' } } },
    { type: 'deck/rename', name: '' },
    { type: 'deck/create', name: 'あ'.repeat(51) },
    { type: 'deck/select', deckId: 'missing' },
    { type: 'group/edit', groupId: 'g1', changes: { include: Array(201).fill('k1') } },
    { type: 'group/edit', groupId: 'g1', changes: { exclude: Array(201).fill('k1') } },
    { type: 'group/edit', groupId: 'g1', changes: { filter: { op: 'pred', pred: { kind: 'cards', cardIds: Array(201).fill('k1') } } } },
    { type: 'group/edit', groupId: 'g1', changes: { filter: { op: 'pred', pred: { kind: 'level', range: { min: 10, max: 5 } } } } },
    { type: 'group/edit', groupId: 'g1', changes: { filter: { op: 'pred', pred: { kind: 'nameContains', text: 'あ'.repeat(101) } } } },
    { type: 'pattern/reorder', patternIds: [] },
    { type: 'pattern/reorder', patternIds: ['p1', 'p1'] },
    { type: 'pattern/reorder', patternIds: ['missing'] },
    { type: 'customCard/edit', cardId: 'c:one', changes: { text: 'あ'.repeat(5001) } },
  ])('不正な更新 $type をエラーにして取り消す', action => {
    const h = harness();
    const before = h.state.app;
    expect(h.send(action).lastError).toBeTruthy();
    expect(h.state.app).toBe(before);
    expect(h.state.app).toEqual(app());
  });

  it('入れ子条件の深さ上限も編集時に適用する', () => {
    const h = harness();
    const before = h.state.app;
    let filter: FilterNode = { op: 'pred', pred: { kind: 'cards', cardIds: [] } };
    for (let i = 0; i < 4; i++) filter = { op: 'not', child: filter };
    h.send({ type: 'group/edit', groupId: 'g1', changes: { filter } });
    expect(h.state.lastError).toContain('深さ');
    expect(h.state.app).toBe(before);
  });

  it('区分移動の合算が60枚超なら移動元・移動先を両方維持する', () => {
    const initial = app();
    initial.decks[0].entries.push(entry('k1', 60, 'side'));
    const h = harness(initial);
    h.send({ type: 'entry/setSection', cardId: 'k1', section: 'main', newSection: 'side' });
    expect(h.state.app).toBe(initial);
    expect(h.state.lastError).toContain('60');
  });

  it('上限200エントリでも既存カードへの合算は許可する', () => {
    const initial = app();
    initial.decks[0].entries = Array.from({ length: 200 }, (_, i) => entry(`k${i}`));
    const h = harness(initial);
    h.send({ type: 'entry/add', cardId: 'k1', name: 'カード', section: 'main' });
    expect(h.state.lastError).toBeNull();
    expect(h.deck.entries).toHaveLength(200);
    expect(h.deck.entries[1].count).toBe(4);
  });
});

describe('復元とデバウンス保存', () => {
  it('保存データがない場合は初期状態で起動する', () => {
    const storage = new FakeStorage();
    expect(loadState(storage, { newId: () => 'd', now: () => 0 })).toEqual({
      state: createInitialState({ newId: () => 'd', now: () => 0 }), notice: null, saveBlocked: false,
    });
  });

  it('保存された状態を復元し、参照切れスロット2件だけを削除して通知する', () => {
    const storage = new FakeStorage();
    const original = app();
    original.decks[0].patterns[0].slots.push(
      { ...slot('s2'), source: { type: 'group', groupId: 'missing' } },
      { ...slot('s3'), source: { type: 'card', cardId: 'unknown' } },
    );
    original.decks[0].patterns.push(pattern('p2', [{ ...slot('s4'), source: { type: 'group', groupId: 'missing' } }]));
    storage.data.set(STORAGE_KEY, JSON.stringify(original));
    const loaded = loadState(storage);
    expect(loaded.saveBlocked).toBe(false);
    expect(loaded.notice).toContain('2 件');
    expect(loaded.state.decks[0].patterns.map(p => p.slots.length)).toEqual([2, 0]);
    expect(loaded.state.decks[0].patterns[0].slots[1].source).toEqual({ type: 'card', cardId: 'unknown' });
    expect(storage.writes).toEqual([]);
    storage.data.set(STORAGE_KEY, JSON.stringify(app()));
    expect(loadState(storage)).toEqual({ state: app(), notice: null, saveBlocked: false });
  });

  it.each(['{broken', JSON.stringify({ ...app(), schemaVersion: 2 }), JSON.stringify({ ...app(), settings: { customHandSize: 11 } })])('破損・版不一致・検証失敗では元の文字列を退避する', raw => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, raw);
    const loaded = loadState(storage, { newId: () => 'first', now: () => 99 });
    expect(storage.data.get(`${STORAGE_KEY}:broken-99`)).toBe(raw);
    expect(loaded.notice).toContain('退避');
    expect(loaded.saveBlocked).toBe(false);
    expect(loaded.state.decks[0].name).toBe('新しいデッキ');
    const saver = createSaver(storage);
    saver.schedule(loaded.state);
    saver.flush();
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toEqual(loaded.state);
    expect(storage.data.get(`${STORAGE_KEY}:broken-99`)).toBe(raw);
  });

  it('退避失敗では元データを残し、schedule と flush でも保存しない', () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, '{broken');
    storage.failWrite = true;
    const loaded = loadState(storage, { now: () => 100 });
    expect(loaded.saveBlocked).toBe(true);
    expect(loaded.notice).toContain('退避に失敗');
    expect(loaded.notice).toContain('容量超過');
    const saver = createSaver(storage, { saveBlocked: loaded.saveBlocked });
    expect(saver.getStatus()).toBe('failed');
    storage.failWrite = false;
    saver.schedule(loaded.state);
    vi.advanceTimersByTime(1000);
    saver.flush();
    expect(saver.getStatus()).toBe('failed');
    expect(storage.data.get(STORAGE_KEY)).toBe('{broken');
    expect(storage.writes).toEqual([`${STORAGE_KEY}:broken-100`]);
  });

  it('読み取り拒否でも自動保存を停止する', () => {
    const storage = new FakeStorage();
    storage.failRead = true;
    const loaded = loadState(storage);
    expect(loaded.saveBlocked).toBe(true);
    expect(loaded.notice).toContain('読み取り拒否');
    expect(storage.writes).toEqual([]);
  });

  it('変更のたびに500ms待ち直して最新状態を1回保存し、状態を通知する', () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    const saver = createSaver(storage);
    const statuses: SaveStatus[] = [];
    const unsubscribe = saver.subscribe(() => statuses.push(saver.getStatus()));
    expect(saver.getStatus()).toBe('saved');
    saver.schedule(app());
    vi.advanceTimersByTime(499);
    expect(storage.writes).toEqual([]);
    const latest = app();
    latest.decks[0].name = '最新';
    saver.schedule(latest);
    vi.advanceTimersByTime(499);
    expect(storage.writes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(storage.writes).toEqual([STORAGE_KEY]);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toEqual(latest);
    expect(statuses).toEqual(['pending', 'pending', 'saved']);
    unsubscribe();
    saver.schedule(app());
    saver.flush();
    vi.advanceTimersByTime(500);
    expect(storage.writes).toHaveLength(2);
    expect(statuses).toHaveLength(3);
  });

  it('保存失敗は failed と原因を公開し、flush で再試行できる', () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    const saver = createSaver(storage, { delayMs: 20 });
    const listener = vi.fn();
    saver.subscribe(listener);
    storage.failWrite = true;
    saver.schedule(app());
    vi.advanceTimersByTime(20);
    expect(saver.getStatus()).toBe('failed');
    expect(saver.getError()).toContain('容量超過');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    storage.failWrite = false;
    saver.flush();
    expect(saver.getStatus()).toBe('saved');
    expect(saver.getError()).toBeNull();
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toEqual(app());
  });
});

describe('デッキ JSON', () => {
  it('書き出し・読み込みの往復は編集用ID以外を保持し、新しいデッキとして追加できる', () => {
    const original = deck();
    original.patterns[0].slots.push({ ...slot('s2'), source: { type: 'card', cardId: 'c:one' } });
    const text = exportDeckJson(original);
    expect(JSON.parse(text)).toEqual({ format: 'shodou-calc-deck', version: 1, deck: original });
    const restored = value(importDeckJson(text, ids()));
    const normalized = structuredClone(restored);
    normalized.id = original.id;
    normalized.groups[0].id = 'g1';
    normalized.patterns[0].id = 'p1';
    normalized.patterns[0].slots[0].id = 's1';
    normalized.patterns[0].slots[0].source = { type: 'group', groupId: 'g1' };
    normalized.patterns[0].slots[1].id = 's2';
    expect(normalized).toEqual(original);
    expect(restored.id).not.toBe(original.id);
    expect(restored.patterns[0].slots[0].source).toEqual({ type: 'group', groupId: restored.groups[0].id });
    expect(new Set([restored.id, restored.groups[0].id, restored.patterns[0].id, ...restored.patterns[0].slots.map(s => s.id)]).size).toBe(5);
    const h = harness();
    h.send({ type: 'deck/import', deck: restored });
    expect(h.state.lastError).toBeNull();
    expect(h.state.app.decks).toHaveLength(2);
    expect(h.state.app.activeDeckId).toBe(restored.id);
    expect(h.deck.updatedAt).toBe(1234);
  });

  it.each(['{broken', 'null', '[]', '{}', JSON.stringify({ format: 'shodou-calc-deck', version: 2, deck: deck() }), JSON.stringify({ format: 'other', version: 1, deck: deck() })])('不正JSON・形式・版を拒否する', text => {
    const newId = vi.fn(ids());
    expect(importDeckJson(text, newId).ok).toBe(false);
    expect(newId).not.toHaveBeenCalled();
  });

  it('ファイルでは参照切れスロットを削除せず全体を拒否する', () => {
    const invalid = deck();
    invalid.groups = [];
    const result = importDeckJson(exportDeckJson(invalid));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('存在しません');
  });

  it('5MBを文字数でなくUTF-8バイト数で判定し、境界を含めて許可する', () => {
    const text = exportDeckJson(deck());
    const bytes = new TextEncoder().encode(text).length;
    expect(importDeckJson(text + ' '.repeat(MAX_FILE_BYTES - bytes)).ok).toBe(true);
    const tooLarge = text + '　'.repeat(Math.ceil((MAX_FILE_BYTES - bytes) / 3) + 1);
    expect(tooLarge.length).toBeLessThan(MAX_FILE_BYTES);
    const result = importDeckJson(tooLarge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('5MB');
  });

  it('File.text() を使い、容量超過は読む前に拒否し、読み取り失敗を返す', async () => {
    const read = vi.fn(async () => exportDeckJson(deck()));
    const file = { size: 1000, text: read } as unknown as File;
    expect((await importDeckFile(file, ids())).ok).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    const tooLarge = { size: MAX_FILE_BYTES + 1, text: read } as unknown as File;
    expect((await importDeckFile(tooLarge)).ok).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
    const broken = { size: 1, text: () => Promise.reject(new Error('読み込み失敗')) } as unknown as File;
    const result = await importDeckFile(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('読み込み失敗');
  });
});
