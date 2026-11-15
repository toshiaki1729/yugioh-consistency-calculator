import { StrictMode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import type { AppState, DrawEffect } from '../src/domain/types';
import { createInitialState } from '../src/state/reducer';
import { STORAGE_KEY } from '../src/state/persist';
import { FakeEngineWorker } from './fixtures/engineWorker';
import sample from './fixtures/yaml-yugi-sample.json';

const db = createCardDb(convertCards(sample, '2026-11-15T00:00:00.000Z').db);
const makeEffect = (cardId = 'k900001', id = 'effect1'): DrawEffect => ({
  id, cardId, oncePerTurn: true, firstOnly: false, drawLock: 'none',
  steps: [{ kind: 'draw', count: 1 }],
});

function initialState() {
  const state = createInitialState({ newId: () => 'deck-a' });
  state.decks[0].entries = [
    { cardId: 'k900002', name: 'B', count: 3, section: 'main' },
    { cardId: 'k900001', name: 'A', count: 3, section: 'main' },
    { cardId: 'k900003', name: 'C', count: 34, section: 'main' },
    { cardId: 'k900004', name: 'EX 専用', count: 1, section: 'extra' },
  ];
  state.decks[0].groups = [{ id: 'g1', name: '対象グループ',
    filter: { op: 'and', children: [] }, include: [], exclude: [] }];
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
  await user.click(screen.getByRole('tab', { name: 'ドロー効果' }));
  function readEffects() {
    fireEvent(window, new Event('pagehide'));
    return (JSON.parse(stored.get(STORAGE_KEY)!) as AppState).decks[0].effects;
  }
  return { user, readEffects, storage };
}

const stepRow = (index = 1) => within(screen.getByRole('group', { name: `手順 ${index}` }));
const editor = () => within(screen.getByRole('region', { name: 'ドロー効果の編集' }));
const list = () => within(screen.getByRole('list', { name: 'ドロー効果一覧' }));

describe('ドロー効果の編集', () => {
  it('名前順の既定カードを追加し、カード・チェック・ドロー制限を保存する', async () => {
    const { user, readEffects } = await setup();
    expect(screen.getByText('カードのドロー効果を手順で設定すると、計算に反映されます。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    expect(readEffects()[0]).toEqual({ ...makeEffect(), id: expect.any(String) });
    expect(editor().getByLabelText('カード')).toHaveValue('k900001');
    expect(editor().queryByRole('option', { name: 'EX 専用' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    expect(editor().getByLabelText('カード')).toHaveValue('k900002');
    expect(within(editor().getByLabelText('カード')).queryByRole('option', { name: 'A' })).not.toBeInTheDocument();
    await user.selectOptions(editor().getByLabelText('カード'), 'k900003');
    await user.click(editor().getByLabelText('1 ターンに 1 回'));
    await user.click(editor().getByLabelText('最初の効果としてだけ使える'));
    for (const drawLock of ['after', 'turn', 'none']) {
      await user.selectOptions(editor().getByLabelText('ドローの制限'), drawLock);
      expect(readEffects()[1]).toMatchObject({ cardId: 'k900003', oncePerTurn: false, firstOnly: true, drawLock });
    }
    expect(list().getByText('最初だけ')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    expect(readEffects()[2].cardId).toBe('k900002');
    expect(screen.getByRole('button', { name: '効果を追加' })).toBeDisabled();
  });

  it('すべての手順を既定値で切り替え、対象・送り先・何でもを保存する', async () => {
    const { user, readEffects } = await setup();
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    const row = stepRow();
    expect(row.getByRole('button', { name: '手順を削除' })).toBeDisabled();
    await user.selectOptions(row.getByLabelText('手順の種類'), 'banishTop');
    expect(readEffects()[0].steps).toEqual([{ kind: 'banishTop', count: 1 }]);
    fireEvent.change(row.getByLabelText('除外枚数'), { target: { value: '10' } });
    await user.selectOptions(row.getByLabelText('手順の種類'), 'excavate');
    expect(readEffects()[0].steps).toEqual([{ kind: 'excavate', count: 1, target: null }]);
    expect(within(row.getByLabelText('対象')).getAllByRole('option')[0]).toHaveTextContent('何でも');
    fireEvent.change(row.getByLabelText('めくる枚数'), { target: { value: '6' } });
    await user.selectOptions(row.getByLabelText('対象'), 'card:k900002');
    expect(readEffects()[0].steps[0]).toEqual({ kind: 'excavate', count: 6, target: { type: 'card', cardId: 'k900002' } });
    await user.selectOptions(row.getByLabelText('対象'), '');
    expect(readEffects()[0].steps[0]).toHaveProperty('target', null);
    await user.selectOptions(row.getByLabelText('手順の種類'), 'search');
    expect(readEffects()[0].steps).toEqual([{ kind: 'search', target: { type: 'group', groupId: 'g1' } }]);
    await user.selectOptions(row.getByLabelText('対象'), 'card:k900003');
    expect(readEffects()[0].steps[0]).toHaveProperty('target', { type: 'card', cardId: 'k900003' });
    await user.selectOptions(row.getByLabelText('手順の種類'), 'handCost');
    expect(readEffects()[0].steps[0]).toEqual({ kind: 'handCost', target: { type: 'group', groupId: 'g1' }, destination: 'graveyard' });
    await user.selectOptions(row.getByLabelText('対象'), 'card:k900002');
    await user.selectOptions(row.getByLabelText('送り先'), 'banishedFaceUp');
    expect(readEffects()[0].steps[0]).toEqual({ kind: 'handCost', target: { type: 'card', cardId: 'k900002' }, destination: 'banishedFaceUp' });
    expect(list().getByText('手札から 1 枚を表側で除外')).toBeVisible();
    await user.selectOptions(row.getByLabelText('手順の種類'), 'draw');
    expect(readEffects()[0].steps).toEqual([{ kind: 'draw', count: 1 }]);
  });

  it.each([
    ['draw', 'ドロー枚数', 5], ['banishTop', '除外枚数', 20], ['excavate', 'めくる枚数', 10],
  ])('%s の空・範囲外の入力は保存せず、両端を保存する', async (kind, label, max) => {
    const { user, readEffects, storage } = await setup();
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    await user.selectOptions(stepRow().getByLabelText('手順の種類'), String(kind));
    const saved = readEffects();
    for (const value of ['', '0', String(Number(max) + 1)]) {
      storage.setItem.mockClear();
      fireEvent.change(stepRow().getByLabelText(label), { target: { value } });
      expect(stepRow().getByLabelText(label)).toHaveValue(value);
      expect(stepRow().getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
      expect(stepRow().getByRole('status')).toHaveTextContent(`1〜${max} の整数を入力してください`);
      expect(stepRow().getByLabelText(label)).toHaveAccessibleDescription(stepRow().getByRole('status').textContent!);
      expect(readEffects()).toEqual(saved);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
    for (const value of ['1', String(max)]) {
      fireEvent.change(stepRow().getByLabelText(label), { target: { value } });
      expect(readEffects()[0].steps[0]).toHaveProperty('count', Number(value));
      expect(stepRow().queryByRole('status')).not.toBeInTheDocument();
    }
  });

  it('手順を6個まで追加し、入力途中の値を行とともに移動し、最後の1個まで削除できる', async () => {
    const { user, readEffects } = await setup();
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    await user.click(screen.getByRole('button', { name: '手順を追加' }));
    await user.selectOptions(stepRow(2).getByLabelText('手順の種類'), 'search');
    fireEvent.change(stepRow().getByLabelText('ドロー枚数'), { target: { value: '99' } });
    await user.click(stepRow(2).getByRole('button', { name: '手順 2 を上へ' }));
    expect(readEffects()[0].steps.map(step => step.kind)).toEqual(['search', 'draw']);
    expect(stepRow(2).getByLabelText('ドロー枚数')).toHaveValue('99');
    expect(stepRow().getByRole('button', { name: '手順 1 を上へ' })).toBeDisabled();
    await user.click(stepRow().getByRole('button', { name: '手順 1 を下へ' }));
    expect(readEffects()[0].steps.map(step => step.kind)).toEqual(['draw', 'search']);
    await user.click(stepRow().getByRole('button', { name: '手順を削除' }));
    expect(stepRow().getByLabelText('手順の種類')).toHaveValue('search');
    expect(screen.queryByText(/この値は保存されていません/)).not.toBeInTheDocument();
    for (let i = 1; i < 6; i++) await user.click(screen.getByRole('button', { name: '手順を追加' }));
    expect(screen.getByRole('button', { name: '手順を追加' })).toBeDisabled();
    expect(stepRow(6).getByRole('button', { name: '手順 6 を下へ' })).toBeDisabled();
    for (let i = 6; i > 1; i--) await user.click(stepRow().getByRole('button', { name: '手順を削除' }));
    expect(stepRow().getByRole('button', { name: '手順を削除' })).toBeDisabled();
    expect(readEffects()[0].steps).toEqual([{ kind: 'draw', count: 1 }]);
  });

  it('効果を優先順に移動し、選択を維持して確認なしで削除する', async () => {
    const { user, readEffects } = await setup();
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    await user.click(list().getByRole('button', { name: 'Bを上へ' }));
    expect(readEffects().map(effect => effect.cardId)).toEqual(['k900002', 'k900001']);
    expect(list().getAllByRole('listitem')[0]).toHaveAttribute('aria-label', 'B');
    expect(editor().getByLabelText('カード')).toHaveValue('k900002');
    expect(list().getByRole('button', { name: 'Bを上へ' })).toBeDisabled();
    await user.click(list().getByRole('button', { name: 'Bを下へ' }));
    expect(readEffects().map(effect => effect.cardId)).toEqual(['k900001', 'k900002']);
    expect(list().getByRole('button', { name: 'Bを下へ' })).toBeDisabled();
    await user.click(list().getByRole('button', { name: /^A 1 ターン/ }));
    expect(editor().getByLabelText('カード')).toHaveValue('k900001');
    await user.click(within(list().getByRole('listitem', { name: 'A' })).getByRole('button', { name: '削除' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readEffects().map(effect => effect.cardId)).toEqual(['k900002']);
    await user.click(list().getByRole('button', { name: '削除' }));
    expect(readEffects()).toEqual([]);
    expect(screen.queryByRole('region', { name: 'ドロー効果の編集' })).not.toBeInTheDocument();
  });

  it('メインにない効果を表示し、対象のない手順は画面内に保持して保存しない', async () => {
    const state = initialState();
    state.decks[0].effects = [makeEffect('k900004')];
    state.decks[0].entries = state.decks[0].entries.filter(entry => entry.section === 'extra');
    state.decks[0].groups = [];
    const { user, readEffects } = await setup(state);
    expect(list().getByText('デッキにないため使われません')).toBeVisible();
    expect(screen.getByText('メインデッキにカードを追加してください。')).toBeVisible();
    expect(screen.getByRole('button', { name: '効果を追加' })).toBeDisabled();
    const saved = readEffects();
    for (const kind of ['search', 'handCost']) {
      await user.selectOptions(stepRow().getByLabelText('手順の種類'), kind);
      expect(stepRow().getByRole('option', { name: '未設定' })).toBeDisabled();
      expect(stepRow().getByRole('status')).toHaveTextContent('対象が未設定です');
      expect(readEffects()).toEqual(saved);
    }
    await user.selectOptions(stepRow().getByLabelText('送り先'), 'banishedFaceUp');
    await user.click(screen.getByRole('button', { name: '手順を追加' }));
    expect(readEffects()).toEqual(saved);
    expect(stepRow().getByLabelText('送り先')).toHaveValue('banishedFaceUp');
    await user.selectOptions(stepRow().getByLabelText('手順の種類'), 'excavate');
    expect(readEffects()[0].steps).toEqual([{ kind: 'excavate', count: 1, target: null }, { kind: 'draw', count: 1 }]);
  });

  it('存在しなくなった対象を未設定と示し、対象の修正で確定する', async () => {
    const state = initialState();
    state.decks[0].effects = [makeEffect()];
    state.decks[0].effects[0].steps = [{ kind: 'search', target: { type: 'card', cardId: 'k999999' } }];
    const { user, readEffects } = await setup(state);
    expect(stepRow().getByRole('option', { name: '未設定' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '手順を追加' }));
    expect(readEffects()[0].steps).toHaveLength(1);
    await user.selectOptions(stepRow().getByLabelText('対象'), 'group:g1');
    expect(readEffects()[0].steps).toEqual([
      { kind: 'search', target: { type: 'group', groupId: 'g1' } }, { kind: 'draw', count: 1 },
    ]);
    expect(stepRow().queryByRole('status')).not.toBeInTheDocument();
  });

  it('グループがない場合は名前順の先頭カードを対象にする', async () => {
    const state = initialState();
    state.decks[0].groups = [];
    const { user, readEffects } = await setup(state);
    await user.click(screen.getByRole('button', { name: '効果を追加' }));
    await user.selectOptions(stepRow().getByLabelText('手順の種類'), 'search');
    expect(readEffects()[0].steps).toEqual([{ kind: 'search', target: { type: 'card', cardId: 'k900001' } }]);
  });

  it('効果30個で追加を止め、削除後は追加を許可する', async () => {
    const state = initialState();
    state.decks[0].entries = Array.from({ length: 31 }, (_, index) => ({
      cardId: `k${900001 + index}`, name: `カード${index}`, count: 1, section: 'main' as const,
    }));
    state.decks[0].effects = state.decks[0].entries.slice(0, 30).map((entry, index) => makeEffect(entry.cardId, `effect${index}`));
    const { user, readEffects } = await setup(state);
    expect(screen.getByRole('button', { name: '効果を追加' })).toBeDisabled();
    await user.click(list().getAllByRole('button', { name: '削除' })[0]);
    expect(screen.getByRole('button', { name: '効果を追加' })).toBeEnabled();
    expect(readEffects()).toHaveLength(29);
  });

  it('ドロー効果タブにキーボードで移動し、デッキなしの案内を表示する', async () => {
    const state = initialState();
    state.decks = [];
    state.activeDeckId = null;
    const { user } = await setup(state);
    await user.click(screen.getByRole('tab', { name: '初動パターン' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'ドロー効果' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'ドロー効果' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByText('デッキがありません。新規デッキを作成してください。')).toBeVisible();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'デッキ' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'ドロー効果' })).toHaveFocus();
  });
});
