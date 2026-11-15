import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb, createCardDbLoader } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import { createInitialState } from '../src/state/reducer';
import { STORAGE_KEY, exportDeckJson } from '../src/state/persist';
import type { AppState } from '../src/domain/types';
import sample from './fixtures/yaml-yugi-sample.json';

const file = convertCards(sample, '2026-11-15T00:00:00.000Z').db;
const db = createCardDb(file);

function setup({ state, loader }: { state?: AppState; loader?: ReturnType<typeof createCardDbLoader> } = {}) {
  const storedValues = new Map<string, string>();
  if (state) storedValues.set(STORAGE_KEY, JSON.stringify(state));
  const storage = {
    getItem: (key: string) => storedValues.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { storedValues.set(key, value); }),
  };
  render(<StrictMode><App storage={storage} db={loader ? undefined : db} loader={loader} /></StrictMode>);
  return { user: userEvent.setup(), storage };
}

describe('デッキ編集', () => {
  it('検索候補をキーボードで選んで追加し、加算・減算・区分移動・削除する', async () => {
    const { user } = setup();
    const search = screen.getByRole('combobox', { name: 'カードを検索' });
    await user.type(search, 'うらら');
    await screen.findByRole('option', { name: /灰流うらら/ });
    await user.keyboard('{ArrowDown}{Enter}{Enter}');
    const main = screen.getByRole('region', { name: 'メイン 2 枚' });
    const row = within(main).getByRole('listitem', { name: '灰流うらら' });
    expect(within(row).getByLabelText('枚数')).toHaveTextContent('2');
    expect(within(row).getByText('★3')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: '枚数を増やす' }));
    expect(within(row).getByLabelText('枚数')).toHaveTextContent('3');
    await user.click(within(row).getByRole('button', { name: '枚数を減らす' }));
    await user.selectOptions(within(row).getByRole('combobox', { name: '区分' }), 'extra');
    const extra = screen.getByRole('region', { name: 'エクストラ 2 枚' });
    expect(within(extra).getByText('灰流うらら')).toBeVisible();
    await user.click(within(extra).getByRole('button', { name: 'カードを削除' }));
    expect(screen.queryByRole('listitem', { name: '灰流うらら' })).not.toBeInTheDocument();
  });

  it('カスタムカードの作成で選択区分に1枚追加し、編集で不要属性を消す', async () => {
    const { user, storage } = setup();
    await user.selectOptions(screen.getByLabelText('追加先'), 'side');
    const opener = screen.getByRole('button', { name: 'カスタムカードを作成' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('カード名')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('カード名'), '試験モンスター');
    await user.click(within(dialog).getByLabelText('ペンデュラム'));
    await user.type(within(dialog).getByLabelText('レベル'), '4');
    await user.type(within(dialog).getByLabelText('Pスケール'), '2');
    await user.click(within(dialog).getByLabelText('攻撃力を ? にする'));
    await user.type(within(dialog).getByLabelText('守備力'), '1500');
    await user.type(within(dialog).getByLabelText('ペンデュラム効果'), '試験効果');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(opener).toHaveFocus();
    let side = screen.getByRole('region', { name: 'サイド 1 枚' });
    expect(within(side).getByText('試験モンスター')).toBeVisible();
    await user.click(within(side).getByRole('button', { name: '編集' }));
    expect(screen.getByLabelText('攻撃力を ? にする')).toBeChecked();
    await user.selectOptions(screen.getByLabelText('カードの種類'), 'trap');
    expect(screen.queryByLabelText('レベル')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ペンデュラム効果')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('魔法罠の種類'), 'counter');
    await user.clear(screen.getByLabelText('カード名'));
    await user.type(screen.getByLabelText('カード名'), '試験罠');
    await user.click(screen.getByRole('button', { name: '保存' }));
    side = screen.getByRole('region', { name: 'サイド 1 枚' });
    expect(within(side).getByText('試験罠')).toBeVisible();
    expect(within(side).getByText('カウンター')).toBeVisible();
    await waitFor(() => {
      const saved = JSON.parse(storage.setItem.mock.calls.at(-1)![1]) as AppState;
      expect(saved.decks[0].customCards[0]).toMatchObject({ kind: 'trap', name: '試験罠', monsterTypes: [], property: 'counter' });
      expect(saved.decks[0].customCards[0]).not.toHaveProperty('atk');
      expect(saved.decks[0].customCards[0]).not.toHaveProperty('pendulumText');
      expect(saved.decks[0].entries[0].name).toBe('試験罠');
    });
  });

  it('整数・空欄を扱い、数値の上限超過は理由を表示して保存しない', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'カスタムカードを作成' }));
    await user.type(screen.getByLabelText('カード名'), '数値確認');
    const level = screen.getByLabelText('レベル');
    fireEvent.change(level, { target: { value: '1.5' } });
    expect(level).toHaveValue('');
    fireEvent.change(level, { target: { value: '-1' } });
    expect(level).toHaveValue('');
    await user.type(level, '100000');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('0〜99999');
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.clear(level);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'メイン 1 枚' })).getByText('数値確認')).toBeVisible();
  });

  it('DB取得失敗を表示し、再試行で検索を使えるようにする（StrictModeでも初回取得は1回）', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(file)));
    const { user } = setup({ loader: createCardDbLoader(fetchImpl) });
    expect(await screen.findByRole('alert')).toHaveTextContent('503');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox', { name: 'カードを検索' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'カードを検索' })).toBeEnabled());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('DB未取得でも保存名を表示し、未取得の案内と60枚超過の注意を出す', () => {
    const state = createInitialState();
    state.decks[0].entries = [
      { cardId: 'k12950', name: '保存済みのカード名', count: 60, section: 'main' },
      { cardId: 'k4007', name: '保存済みの別カード', count: 1, section: 'main' },
    ];
    const loading = createCardDbLoader(() => new Promise(() => {}));
    setup({ state, loader: loading });
    expect(screen.getByText('カードDBを読み込み中…')).toBeVisible();
    expect(screen.getByText('保存済みのカード名')).toBeVisible();
    expect(screen.getAllByText('未取得')).toHaveLength(2);
    expect(screen.getAllByText(/グループに手動で追加/)).toHaveLength(2);
    expect(screen.getByText(/計算できません（60 枚まで）/)).toHaveTextContent('61 枚');
    const row = screen.getByRole('listitem', { name: '保存済みのカード名' });
    expect(within(row).getByRole('button', { name: '枚数を増やす' })).toBeDisabled();
  });

  it('解決はカスタム→DB→pageDataの順で行い、種類順に並べる', () => {
    const state = createInitialState();
    const deck = state.decks[0];
    const monster = db.getCard('k12950')!;
    const spell = db.findByExactName('強欲な壺')[0];
    deck.customCards = [{ ...monster, id: 'c:priority', name: 'カスタム優先', custom: true }];
    deck.pageData = {
      [monster.id]: { ...monster, name: 'ページ側モンスター' },
      [spell.id]: { ...spell, name: 'ページ側魔法' },
      k999999: { id: 'k999999', name: 'ページの罠', kind: 'trap', monsterTypes: [], text: '' },
    };
    deck.entries = [
      { cardId: 'k888888', name: '未取得カード', count: 1, section: 'main' },
      { cardId: 'k999999', name: '旧名称', count: 1, section: 'main' },
      { cardId: spell.id, name: spell.name, count: 1, section: 'main' },
      { cardId: 'c:priority', name: monster.name, count: 1, section: 'main' },
    ];
    setup({ state });
    const rows = within(screen.getByRole('region', { name: 'メイン 4 枚' })).getAllByRole('listitem');
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['カスタム優先', '強欲な壺', 'ページの罠', '未取得カード']);
  });

  it('区分移動先に同じカードがあれば合算し、1枚からの減算で削除する', async () => {
    const state = createInitialState();
    state.decks[0].entries = [
      { cardId: 'k12950', name: '灰流うらら', count: 2, section: 'main' },
      { cardId: 'k12950', name: '灰流うらら', count: 1, section: 'side' },
    ];
    const { user } = setup({ state });
    const side = screen.getByRole('region', { name: 'サイド 1 枚' });
    await user.selectOptions(within(side).getByRole('combobox', { name: '区分' }), 'main');
    const main = screen.getByRole('region', { name: 'メイン 3 枚' });
    expect(within(main).getAllByRole('listitem')).toHaveLength(1);
    for (let i = 0; i < 3; i++) await user.click(within(main).getByRole('button', { name: '枚数を減らす' }));
    expect(screen.getByRole('region', { name: 'メイン 0 枚' })).toBeVisible();
  });
});

describe('ヘッダー', () => {
  it('作成・名前変更・複製・選択・確認付き削除を行い、Dialog終了時にフォーカスを戻す', async () => {
    const { user } = setup();
    const header = within(screen.getByRole('banner'));
    const create = header.getByRole('button', { name: '新規デッキ' });
    await user.click(create);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(create).toHaveFocus();
    await user.click(create);
    await user.clear(screen.getByLabelText('デッキ名'));
    await user.type(screen.getByLabelText('デッキ名'), 'テストデッキ');
    await user.click(screen.getByRole('button', { name: '保存' }));
    const select = header.getByRole('combobox', { name: 'デッキ選択' });
    expect(select).toHaveDisplayValue('テストデッキ');
    await user.click(header.getByRole('button', { name: '名前変更' }));
    await user.clear(screen.getByLabelText('デッキ名'));
    await user.type(screen.getByLabelText('デッキ名'), '変更済み');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await user.click(header.getByRole('button', { name: '複製' }));
    expect(select).toHaveDisplayValue('変更済みのコピー');
    await user.selectOptions(select, within(select).getByRole('option', { name: '変更済み' }));
    expect(select).toHaveDisplayValue('変更済み');
    await user.click(header.getByRole('button', { name: 'デッキ削除' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('変更済み');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(select).toHaveDisplayValue('変更済み');
    for (let i = 0; i < 3; i++) {
      await user.click(header.getByRole('button', { name: 'デッキ削除' }));
      await user.click(screen.getByRole('button', { name: '削除する' }));
    }
    expect(within(screen.getByRole('tabpanel', { name: 'デッキ' }))
      .getByText('デッキがありません。新規デッキを作成してください。')).toBeVisible();
    expect(header.getByRole('button', { name: 'JSON 書き出し' })).toBeDisabled();
  });

  it('不正JSONの理由を表示し、有効なデッキJSONを新規デッキとして読み込む', async () => {
    const { user } = setup();
    const input = screen.getByLabelText('デッキ JSON ファイル');
    await user.upload(input, new File(['{broken'], 'broken.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON ファイルを読み込めません');
    await user.click(screen.getByRole('button', { name: '読み込みエラーを閉じる' }));
    const imported = createInitialState().decks[0];
    imported.name = '読み込みデッキ';
    imported.entries = [{ cardId: 'k12950', name: '灰流うらら', count: 3, section: 'main' }];
    await user.upload(input, new File([exportDeckJson(imported)], 'deck.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByLabelText('デッキ選択')).toHaveDisplayValue('読み込みデッキ'));
    expect(screen.getByRole('region', { name: 'メイン 3 枚' })).toBeVisible();
    expect(screen.getByLabelText('デッキ選択')).not.toHaveValue(imported.id);
  });

  it('起動通知とreducerのエラーを閉じられる', async () => {
    const state = createInitialState();
    state.decks[0].patterns = [{ id: 'p', name: '参照切れ', enabled: true, slots: [
      { id: 's', source: { type: 'group', groupId: 'missing' }, count: 1, distinctNames: false },
    ], conditions: [] }];
    state.decks[0].entries = [{ cardId: 'k12950', name: '灰流うらら', count: 60, section: 'main' }];
    const { user } = setup({ state });
    expect(screen.getByText(/スロットを 1 件削除/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '通知を閉じる' }));
    expect(screen.queryByText(/スロットを 1 件削除/)).not.toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: 'カードを検索' }), 'うらら');
    await user.click(await screen.findByRole('option', { name: /灰流うらら/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('1〜60');
    await user.click(screen.getByRole('button', { name: 'エラーを閉じる' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'メイン 60 枚' })).toBeVisible();
  });
});
