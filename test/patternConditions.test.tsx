import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import type { AppState } from '../src/domain/types';
import { createInitialState } from '../src/state/reducer';
import { STORAGE_KEY } from '../src/state/persist';
import { FakeEngineWorker } from './fixtures/engineWorker';
import sample from './fixtures/yaml-yugi-sample.json';

const db = createCardDb(convertCards(sample, '2026-11-15T00:00:00.000Z').db);

function initialState() {
  const state = createInitialState({ newId: () => 'deck-a' });
  const deck = state.decks[0];
  deck.entries = [
    { cardId: 'k12950', name: '灰流うらら', count: 3, section: 'main' },
    { cardId: 'k551', name: 'その他', count: 37, section: 'main' },
    { cardId: 'k999999', name: 'EX 専用', count: 1, section: 'extra' },
  ];
  deck.groups = [{ id: 'g1', name: 'うらら', filter: { op: 'pred', pred: {
    kind: 'cards', cardIds: ['k12950'],
  } }, include: [], exclude: [] }];
  deck.patterns = [{ id: 'p1', name: '条件初動', enabled: true, slots: [], conditions: [] }];
  return state;
}

async function setup(state = initialState()) {
  const stored = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { stored.set(key, value); }),
  };
  render(<StrictMode><App storage={storage} db={db}
    createWorker={() => new FakeEngineWorker()} /></StrictMode>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: '初動パターン' }));
  function readConditions() {
    fireEvent(window, new Event('pagehide'));
    const saved = JSON.parse(stored.get(STORAGE_KEY)!) as AppState;
    return saved.decks[0].patterns[0].conditions;
  }
  return { user, readConditions, storage };
}

const conditionRow = (index = 1) => within(screen.getByRole('group', { name: `条件 ${index}` }));

describe('初動パターンの追加の条件', () => {
  it('既定の条件を追加し、条件だけの要約と計算を表示して削除できる', async () => {
    const { user, readConditions } = await setup();
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    expect(readConditions()).toEqual([
      { kind: 'deckAtLeast', target: { type: 'group', groupId: 'g1' }, count: 1 },
    ]);
    const row = conditionRow();
    expect(row.getByLabelText('条件の種類')).toHaveValue('deckAtLeast');
    expect(row.getByLabelText('対象')).toHaveValue('group:g1');
    expect(row.getByLabelText('N 枚以上')).toHaveValue('1');
    const list = within(screen.getByRole('list', { name: 'パターン一覧' }));
    expect(list.getByText('＋条件 1')).toBeVisible();
    expect(list.queryByText(/スロット/)).not.toBeInTheDocument();
    expect(row.getByText(/判定の時点でデッキに残っている枚数です/)).toBeVisible();
    const panel = screen.getByRole('complementary', { name: '計算結果' });
    await user.click(panel.querySelector<HTMLButtonElement>('.result-actions button')!);
    await waitFor(() => expect(within(panel).getByText('計算が完了しました')).toBeVisible());
    await user.click(row.getByRole('button', { name: '条件を削除' }));
    expect(readConditions()).toEqual([]);
    expect(screen.queryByRole('group', { name: '条件 1' })).not.toBeInTheDocument();
    expect(list.getByText('スロットか条件を追加してください')).toBeVisible();
  });

  it('種類を変えると値を初期化し、対象を保持して送り先を1つ以上選べる', async () => {
    const { user, readConditions } = await setup();
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    const row = conditionRow();
    await user.selectOptions(row.getByLabelText('対象'), 'card:k12950');
    fireEvent.change(row.getByLabelText('N 枚以上'), { target: { value: '9' } });
    await user.selectOptions(row.getByLabelText('条件の種類'), 'deckAfterBanish');
    expect(row.getByLabelText('N 枚以上')).toHaveValue('1');
    expect(row.getByLabelText('上から X 枚を除外')).toHaveValue('3');
    expect(row.getByText('この条件があると、計算はシミュレーションになります。')).toBeVisible();
    fireEvent.change(row.getByLabelText('上から X 枚を除外'), { target: { value: '10' } });
    await user.selectOptions(row.getByLabelText('条件の種類'), 'movedExcludes');
    expect(row.getByLabelText('表側で除外')).toBeChecked();
    expect(row.getByLabelText('表側で除外')).toBeDisabled();
    await user.click(row.getByLabelText('墓地'));
    await user.click(row.getByLabelText('裏側で除外'));
    await user.click(row.getByLabelText('表側で除外'));
    expect(readConditions()[0]).toEqual({ kind: 'movedExcludes',
      target: { type: 'card', cardId: 'k12950' }, zones: ['graveyard', 'banishedFaceDown'] });
    await user.click(row.getByLabelText('墓地'));
    expect(row.getByLabelText('裏側で除外')).toBeDisabled();
    await user.click(row.getByLabelText('裏側で除外'));
    expect(readConditions()[0]).toHaveProperty('zones', ['banishedFaceDown']);
    expect(row.getByText(/「含まれない」は常に満たし、「含まれる」は満たしません/)).toBeVisible();
    await user.selectOptions(row.getByLabelText('条件の種類'), 'movedIncludes');
    expect(readConditions()[0]).toEqual({ kind: 'movedIncludes',
      target: { type: 'card', cardId: 'k12950' }, zones: ['banishedFaceUp'] });
    await user.selectOptions(row.getByLabelText('条件の種類'), 'deckAtLeast');
    expect(readConditions()[0]).toEqual({ kind: 'deckAtLeast',
      target: { type: 'card', cardId: 'k12950' }, count: 1 });
    expect(row.queryByRole('group', { name: '送り先' })).not.toBeInTheDocument();
    await user.selectOptions(row.getByLabelText('条件の種類'), 'deckAfterBanish');
    expect(row.getByLabelText('上から X 枚を除外')).toHaveValue('3');
    expect(row.getByLabelText('対象')).toHaveValue('card:k12950');
  });

  it.each([
    ['deckAtLeast', 'N 枚以上', 'count', 60],
    ['deckAfterBanish', 'N 枚以上', 'count', 60],
    ['deckAfterBanish', '上から X 枚を除外', 'banish', 20],
  ] as const)('%s の %s は空・範囲外を保存せず、両端を保存する', async (kind, label, field, max) => {
    const { user, readConditions, storage } = await setup();
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    const row = conditionRow();
    await user.selectOptions(row.getByLabelText('条件の種類'), kind);
    const saved = readConditions();
    for (const value of ['', '0', String(max + 1)]) {
      storage.setItem.mockClear();
      fireEvent.change(row.getByLabelText(label), { target: { value } });
      expect(row.getByLabelText(label)).toHaveValue(value);
      expect(row.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
      expect(row.getByRole('status')).toHaveTextContent(`1〜${max} の整数を入力してください`);
      expect(row.getByLabelText(label)).toHaveAccessibleDescription(row.getByRole('status').textContent!);
      expect(readConditions()).toEqual(saved);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
    for (const value of ['1', String(max)]) {
      fireEvent.change(row.getByLabelText(label), { target: { value } });
      expect(readConditions()[0]).toHaveProperty(field, Number(value));
      expect(row.getByLabelText(label)).toHaveAttribute('aria-invalid', 'false');
      expect(row.queryByRole('status')).not.toBeInTheDocument();
    }
  });

  it('8個で追加を止め、行削除で別の行へ未保存の値を引き継がない', async () => {
    const { user, readConditions } = await setup();
    const add = screen.getByRole('button', { name: '条件を追加' });
    for (let i = 0; i < 8; i++) await user.click(add);
    expect(add).toBeDisabled();
    fireEvent.change(conditionRow().getByLabelText('N 枚以上'), { target: { value: '99' } });
    await user.click(conditionRow().getByRole('button', { name: '条件を削除' }));
    expect(readConditions()).toHaveLength(7);
    expect(add).toBeEnabled();
    expect(conditionRow().getByLabelText('N 枚以上')).toHaveValue('1');
    expect(screen.queryByText(/この値は保存されていません/)).not.toBeInTheDocument();
  });

  it('グループ削除の連動後に残った条件の対象・枚数・要約を表示する', async () => {
    const state = initialState();
    state.decks[0].patterns[0].conditions = [
      { kind: 'deckAtLeast', target: { type: 'group', groupId: 'g1' }, count: 1 },
      { kind: 'deckAtLeast', target: { type: 'card', cardId: 'k12950' }, count: 2 },
    ];
    const { user, readConditions } = await setup(state);
    await user.click(screen.getByRole('tab', { name: 'カードグループ' }));
    await user.click(within(screen.getByRole('region', { name: 'グループの編集' }))
      .getByRole('button', { name: '削除' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    await user.click(screen.getByRole('tab', { name: '初動パターン' }));
    expect(readConditions()).toEqual([
      { kind: 'deckAtLeast', target: { type: 'card', cardId: 'k12950' }, count: 2 },
    ]);
    expect(conditionRow().getByLabelText('対象')).toHaveValue('card:k12950');
    expect(conditionRow().getByLabelText('N 枚以上')).toHaveValue('2');
    expect(screen.queryByRole('group', { name: '条件 2' })).not.toBeInTheDocument();
    expect(screen.getByText('＋条件 1')).toBeVisible();
  });

  it('カードのみの場合は名前順の先頭を対象にする', async () => {
    const state = initialState();
    state.decks[0].groups = [];
    const expected = [...state.decks[0].entries].filter(entry => entry.section === 'main')
      .sort((left, right) => (db.getCard(left.cardId)?.name ?? left.name)
        .localeCompare(db.getCard(right.cardId)?.name ?? right.name, 'ja'))[0];
    const { user, readConditions } = await setup(state);
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    expect(readConditions()[0].target).toEqual({ type: 'card', cardId: expected.cardId });
    expect(conditionRow().queryByRole('option', { name: 'カード: EX 専用' })).not.toBeInTheDocument();
  });

  it('グループもメインカードも無いときは対象作成の案内を出す', async () => {
    const state = initialState();
    state.decks[0].groups = [];
    state.decks[0].entries = state.decks[0].entries.filter(entry => entry.section === 'extra');
    await setup(state);
    expect(screen.getByRole('button', { name: '条件を追加' })).toBeDisabled();
    expect(screen.getByText('条件の対象にするカードをメインデッキに追加するか、カードグループを作成してください。')).toBeVisible();
  });

  it('スロットと共通の対象候補と、メインデッキにないカードの表示を使う', async () => {
    const state = initialState();
    state.decks[0].patterns[0].slots = [{ id: 's1', source: { type: 'card', cardId: 'k12950' },
      count: 1, distinctNames: false }];
    state.decks[0].patterns[0].conditions = [
      { kind: 'deckAtLeast', target: { type: 'card', cardId: 'k12950' }, count: 1 },
    ];
    const { user } = await setup(state);
    const slot = within(screen.getByRole('group', { name: 'スロット 1' }));
    expect(conditionRow().getAllByRole('option').slice(4).map(option => option.textContent))
      .toEqual(within(slot.getByLabelText('対象')).getAllByRole('option').map(option => option.textContent));
    expect(screen.getByText('灰流うらら ×1 ＋条件 1')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'デッキ' }));
    await user.click(within(screen.getByRole('listitem', { name: '灰流うらら' }))
      .getByRole('button', { name: 'カードを削除' }));
    await user.click(screen.getByRole('tab', { name: '初動パターン' }));
    expect(conditionRow().getByRole('option', { name: 'メインデッキにないカード' })).toBeDisabled();
  });
});
