import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb, createCardDbLoader } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import { createInitialState } from '../src/state/reducer';
import { STORAGE_KEY } from '../src/state/persist';
import type { AppState, CardGroup } from '../src/domain/types';
import sample from './fixtures/yaml-yugi-sample.json';

const file = convertCards(sample, '2026-11-15T00:00:00.000Z').db;
const db = createCardDb(file);
const emptyGroup = (id = 'g1'): CardGroup => ({ id, name: 'グループ 1', filter: { op: 'and', children: [] }, include: [], exclude: [] });

function initialState() {
  const state = createInitialState();
  state.decks[0].entries = file.cards.map(card => ({ cardId: card.id, name: card.name, count: card.id === 'k12950' ? 3 : 1, section: 'main' }));
  state.decks[0].entries.push({ cardId: 'k999999', name: '未収録カード', count: 2, section: 'main' });
  state.decks[0].entries.push({ cardId: 'k12950', name: '灰流うらら', count: 2, section: 'extra' });
  state.decks[0].entries.push({ cardId: 'k12950', name: '灰流うらら', count: 1, section: 'side' });
  return state;
}

async function setup(state = initialState(), loader?: ReturnType<typeof createCardDbLoader>) {
  const storage = { getItem: (key: string) => key === STORAGE_KEY ? JSON.stringify(state) : null, setItem: vi.fn() };
  render(<StrictMode><App storage={storage} db={loader ? undefined : db} loader={loader} /></StrictMode>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'カードグループ' }));
  return { user, storage };
}

describe('カードグループ画面', () => {
  it('モンスター・レベル4以下・攻撃力1500以下を設定し、除外と復帰を集計に反映する', async () => {
    const { user, storage } = await setup();
    expect(screen.getByText(/カードグループを作ると/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'グループを作成' }));
    expect(screen.getByRole('button', { name: 'グループ 1 17 種 / 19 枚' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'cardKind');
    await user.click(screen.getByRole('checkbox', { name: 'モンスター' }));
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    const level = within(screen.getByRole('group', { name: '条件 2' }));
    await user.selectOptions(level.getByLabelText('条件の種類'), 'level');
    await user.type(level.getByLabelText('以下'), '4');
    await waitFor(() => expect(screen.getByRole('button', { name: 'グループ 1 1 種 / 3 枚' })).toBeVisible());
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    const attack = within(screen.getByRole('group', { name: '条件 3' }));
    await user.selectOptions(attack.getByLabelText('条件の種類'), 'atk');
    await user.type(attack.getByLabelText('以下'), '1500');
    await waitFor(() => {
      const saved = JSON.parse(storage.setItem.mock.calls.at(-1)![1]) as AppState;
      expect(saved.decks[0].groups[0].filter).toEqual({ op: 'and', children: [
        { op: 'pred', pred: { kind: 'cardKind', values: ['monster'] } },
        { op: 'pred', pred: { kind: 'level', range: { max: 4 } } },
        { op: 'pred', pred: { kind: 'atk', range: { max: 1500 } } },
      ] });
    });
    const matches = within(screen.getByRole('region', { name: '該当カード' }));
    await waitFor(() => expect(matches.getAllByRole('listitem').map(row => row.getAttribute('aria-label'))).toEqual(['灰流うらら']));
    const row = matches.getByRole('listitem', { name: '灰流うらら' });
    expect(within(row).getByText('3 枚')).toBeVisible();
    await user.click(within(row).getByLabelText('除外'));
    expect(row).toHaveClass('GroupsView-excluded');
    expect(within(row).getByText('手動で除外')).toBeVisible();
    expect(screen.getByRole('button', { name: 'グループ 1 0 種 / 0 枚' })).toBeVisible();
    await user.click(within(row).getByLabelText('除外'));
    expect(row).not.toHaveClass('GroupsView-excluded');
    expect(screen.getByRole('button', { name: 'グループ 1 1 種 / 3 枚' })).toBeVisible();
    await user.clear(level.getByLabelText('以下'));
    await user.type(level.getByLabelText('以下'), '2');
    await waitFor(() => expect(matches.queryAllByRole('listitem')).toHaveLength(0));
    expect(screen.getByRole('button', { name: 'グループ 1 0 種 / 0 枚' })).toBeVisible();
  });

  it('未取得カードを手動追加して集計し、該当一覧に出さず取り消せる', async () => {
    const state = initialState();
    state.decks[0].groups = [emptyGroup()];
    const { user } = await setup(state);
    expect(screen.getByText(/未取得カードは条件で判定できません/)).toHaveTextContent('1 種 / 2 枚');
    const matches = within(screen.getByRole('region', { name: '該当カード' }));
    expect(matches.queryByText('未収録カード')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('追加するカード'), 'k999999');
    await user.click(screen.getByRole('button', { name: '手動で追加' }));
    expect(screen.getByRole('button', { name: 'グループ 1 18 種 / 21 枚' })).toBeVisible();
    expect(matches.queryByText('未収録カード')).not.toBeInTheDocument();
    const manual = within(screen.getByRole('list', { name: '未取得カードの手動設定' }));
    expect(manual.getByText('未収録カード')).toBeVisible();
    await user.click(manual.getByLabelText('除外'));
    expect(screen.getByRole('button', { name: 'グループ 1 17 種 / 19 枚' })).toBeVisible();
    await user.click(manual.getByLabelText('除外'));
    await user.click(manual.getByRole('button', { name: '手動追加を取り消す' }));
    expect(screen.getByRole('option', { name: '未収録カード（2 枚・未取得）' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'グループ 1 17 種 / 19 枚' })).toBeVisible();
  });

  it('条件外の既知カードを追加・取消しでき、条件変更後も除外行が残る', async () => {
    const state = initialState();
    state.decks[0].groups = [{ ...emptyGroup(), filter: { op: 'and', children: [{ op: 'pred', pred: { kind: 'cardKind', values: ['spell'] } }] } }];
    const { user } = await setup(state);
    await user.selectOptions(screen.getByLabelText('追加するカード'), 'k12950');
    await user.click(screen.getByRole('button', { name: '手動で追加' }));
    const row = within(screen.getByRole('listitem', { name: '灰流うらら' }));
    expect(row.getByText('手動で追加')).toBeVisible();
    await user.click(row.getByLabelText('除外'));
    expect(screen.queryByRole('option', { name: /灰流うらら/ })).not.toBeInTheDocument();
    await user.click(row.getByRole('button', { name: '手動追加を取り消す' }));
    expect(row.getByText('手動で除外')).toBeVisible();
    await user.click(row.getByLabelText('除外'));
    expect(screen.queryByRole('listitem', { name: '灰流うらら' })).not.toBeInTheDocument();
    const spell = within(screen.getByRole('listitem', { name: '強欲な壺' }));
    await user.click(spell.getByLabelText('除外'));
    await user.click(screen.getByRole('checkbox', { name: '罠' }));
    await user.click(screen.getByRole('checkbox', { name: '魔法' }));
    expect(spell.getByLabelText('除外')).toBeChecked();
    expect(spell.getByText('手動で除外')).toBeVisible();
    await user.click(spell.getByLabelText('除外'));
    expect(screen.queryByRole('listitem', { name: '強欲な壺' })).not.toBeInTheDocument();
  });

  it('参照パターン名を確認し、キャンセルでは保持、削除では該当スロットのみ削除する', async () => {
    const state = initialState();
    const deck = state.decks[0];
    deck.groups = [emptyGroup()];
    deck.patterns = [{ id: 'p1', name: '二枚初動', enabled: true, slots: [
      { id: 's1', source: { type: 'group', groupId: 'g1' }, count: 1, distinctNames: false },
      { id: 's2', source: { type: 'card', cardId: 'k12950' }, count: 1, distinctNames: false },
    ], conditions: [] }, { id: 'p2', name: '無効な初動', enabled: false, slots: [
      { id: 's3', source: { type: 'group', groupId: 'g1' }, count: 1, distinctNames: false },
    ], conditions: [] }];
    const { user, storage } = await setup(state);
    await user.click(screen.getByRole('button', { name: '削除' }));
    let dialog = within(screen.getByRole('dialog', { name: 'グループを削除' }));
    expect(dialog.getByText('二枚初動')).toBeVisible();
    expect(dialog.getByText('無効な初動')).toBeVisible();
    expect(dialog.getByText('これらのパターンから該当するスロットも削除されます。')).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByLabelText('グループ名')).toHaveValue('グループ 1');
    await user.click(screen.getByRole('button', { name: '削除' }));
    dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: '削除する' }));
    expect(screen.getByText(/カードグループを作ると/)).toBeVisible();
    await waitFor(() => {
      const saved = JSON.parse(storage.setItem.mock.calls.at(-1)![1]) as AppState;
      expect(saved.decks[0].groups).toEqual([]);
      expect(saved.decks[0].patterns.map(pattern => pattern.slots.map(slot => slot.id))).toEqual([['s2'], []]);
    });
  });

  it('名前変更・空名の取消し・複製・連番の作成・選択を行う', async () => {
    const state = initialState();
    state.decks[0].groups = [emptyGroup()];
    const { user } = await setup(state);
    const name = screen.getByLabelText('グループ名');
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue('グループ 1');
    await user.clear(name);
    await user.type(name, '魔法');
    await user.tab();
    await user.click(within(screen.getByRole('region', { name: 'グループの編集' })).getByRole('button', { name: '複製' }));
    expect(screen.getByLabelText('グループ名')).toHaveValue('魔法のコピー');
    await user.click(screen.getByRole('button', { name: 'グループを作成' }));
    expect(screen.getByLabelText('グループ名')).toHaveValue('グループ 1');
    await user.click(screen.getByRole('button', { name: 'グループを作成' }));
    expect(screen.getByLabelText('グループ名')).toHaveValue('グループ 2');
    await user.click(screen.getByRole('button', { name: '魔法 17 種 / 19 枚' }));
    expect(screen.getByLabelText('グループ名')).toHaveValue('魔法');
  });

  it('DBの読込完了で所属と未取得件数を再計算する', async () => {
    const state = initialState();
    state.decks[0].groups = [emptyGroup()];
    let finish!: (response: Response) => void;
    const loader = createCardDbLoader(() => new Promise<Response>(resolve => { finish = resolve; }));
    await setup(state, loader);
    expect(screen.getByRole('button', { name: 'グループ 1 0 種 / 0 枚' })).toBeVisible();
    finish(new Response(JSON.stringify(file)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'グループ 1 17 種 / 19 枚' })).toBeVisible());
    expect(screen.getByText(/未取得カードは条件で判定できません/)).toHaveTextContent('1 種 / 2 枚');
  });

  it('アクティブデッキがなければ空状態を表示する', async () => {
    await setup({ schemaVersion: 2, decks: [], activeDeckId: null, settings: { customHandSize: null } });
    expect(within(screen.getByRole('tabpanel', { name: 'カードグループ' })).getByText('デッキがありません。新規デッキを作成してください。')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'グループを作成' })).not.toBeInTheDocument();
  });
});
