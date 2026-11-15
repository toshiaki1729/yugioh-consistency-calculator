import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import { createInitialState } from '../src/state/reducer';
import { STORAGE_KEY } from '../src/state/persist';
import { compile } from '../src/engine/compile';
import { runEngine } from '../src/engine/run';
import type { EngineInput } from '../src/engine/types';
import { stableInputKey } from '../src/ui/patterns/CalculationProvider';
import type { Pattern } from '../src/domain/types';
import { FakeEngineWorker } from './fixtures/engineWorker';
import sample from './fixtures/yaml-yugi-sample.json';

const db = createCardDb(convertCards(sample, '2026-11-15T00:00:00.000Z').db);
const percent = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pattern = (): Pattern => ({ id: 'p1', name: '二枚初動', enabled: true, slots: [
  { id: 's1', source: { type: 'group', groupId: 'g1' }, count: 1, distinctNames: false },
  { id: 's2', source: { type: 'card', cardId: 'k12950' }, count: 1, distinctNames: false },
] });

function initialState(withPattern = true) {
  const state = createInitialState({ newId: () => 'deck-a' });
  const deck = state.decks[0];
  deck.name = 'デッキ A';
  deck.entries = [
    { cardId: 'k12950', name: '灰流うらら', count: 3, section: 'main' },
    { cardId: 'k551', name: 'その他', count: 37, section: 'main' },
    { cardId: 'k999999', name: 'EX 専用', count: 1, section: 'extra' },
  ];
  deck.groups = [{ id: 'g1', name: 'うらら', filter: { op: 'pred', pred: { kind: 'cards', cardIds: ['k12950'] } }, include: [], exclude: [] }];
  if (withPattern) deck.patterns = [pattern()];
  return state;
}

async function setup(state = initialState(), deferred = false) {
  const storage = { getItem: (key: string) => key === STORAGE_KEY ? JSON.stringify(state) : null, setItem: vi.fn() };
  const workers: FakeEngineWorker[] = [];
  const createWorker = () => { const worker = new FakeEngineWorker(); worker.deferred = deferred; workers.push(worker); return worker; };
  render(<StrictMode><App storage={storage} db={db} createWorker={createWorker} /></StrictMode>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: '初動パターン' }));
  const panelElement = screen.getByRole('complementary', { name: '計算結果' });
  const panel = within(panelElement);
  // happy-dom はメディアクエリをレイアウトしないため、詳細側の操作を指定する。
  const calculate = () => user.click(panelElement.querySelector<HTMLButtonElement>('.result-actions button')!);
  return { user, storage, workers, panel, panelElement, calculate };
}

describe('初動パターンと計算結果', () => {
  it('グループとカードのスロットを作成し、直接計算と同じ先攻・後攻の全体と単独の確率を表示する', async () => {
    const state = initialState(false);
    const { user, workers, panel, calculate } = await setup(state);
    await user.click(screen.getByRole('button', { name: 'パターンを作成' }));
    expect(screen.getByLabelText('パターン名')).toHaveValue('パターン 1');
    await user.click(screen.getByRole('button', { name: 'スロットを追加' }));
    await user.click(screen.getByRole('button', { name: 'スロットを追加' }));
    await user.selectOptions(within(screen.getByRole('group', { name: 'スロット 2' })).getByLabelText('対象'), 'card:k12950');
    expect(screen.queryByRole('option', { name: 'カード: EX 専用' })).not.toBeInTheDocument();
    expect(screen.getByText('うらら ×1 + 灰流うらら ×1')).toBeVisible();
    await calculate();
    await waitFor(() => expect(panel.getByText('計算が完了しました')).toBeVisible());
    const expectedDeck = structuredClone(state.decks[0]);
    expectedDeck.patterns = [pattern()];
    const input = compile(expectedDeck, db.getCard, [5, 6]);
    if (!input.ok) throw new Error(input.error);
    const expected = runEngine(input.value);
    const table = within(panel.getByRole('table', { name: '初動率' }));
    for (const result of expected) {
      const row = table.getByRole('row', { name: new RegExp(result.handSize === 5 ? '先攻 5 枚' : '後攻 6 枚') });
      expect(within(row).getByText(percent.format(result.success.p))).toBeVisible();
      expect(within(row).getByText('厳密')).toBeVisible();
    }
    const list = within(screen.getByRole('list', { name: 'パターン一覧' }));
    expect(list.getByText(percent.format(expected[0].perPattern.p1.p))).toBeVisible();
    expect(workers[0].request?.input.handSizes).toEqual([5, 6]);
    expect(panel.getByText(/計算時間 \d+\.\d{2} 秒/)).toBeVisible();
  });

  it('計算後の必要枚数変更とコンパイルエラーを古い結果として表示する', async () => {
    const { user, calculate, panel } = await setup();
    await calculate();
    await waitFor(() => expect(panel.getByRole('table')).toBeVisible());
    await user.selectOptions(within(screen.getByRole('group', { name: 'スロット 1' })).getByLabelText('必要枚数'), '2');
    expect(panel.getByText('古い結果（再計算してください）')).toHaveClass('result-warning');
    await user.click(screen.getByLabelText('二枚初動を有効にする'));
    expect(panel.getByText('有効な初動パターンがありません')).toBeVisible();
    expect(panel.getByText('古い結果（再計算してください）')).toBeVisible();
    expect(panel.getByRole('table')).toBeVisible();
    expect(screen.getByText('無効', { selector: '.PatternsView-row > span' })).toBeVisible();
  });

  it('デッキ A の計算を切替時に中止し、遅い応答もデッキ B に表示しない', async () => {
    const state = initialState();
    state.decks.push({ ...structuredClone(state.decks[0]), id: 'deck-b', name: 'デッキ B' });
    const { user, workers, calculate, panel } = await setup(state, true);
    await calculate();
    expect(panel.getByRole('progressbar')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('デッキ選択'), 'deck-b');
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    await act(async () => workers[0].complete());
    expect(panel.queryByRole('table')).not.toBeInTheDocument();
    expect(panel.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'パターン一覧' })).getByText('未計算')).toBeVisible();
    await calculate();
    await act(async () => workers[1].complete());
    expect(panel.getByRole('table')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('デッキ選択'), 'deck-a');
    expect(panel.queryByRole('table')).not.toBeInTheDocument();
  });

  it('再計算中の進捗・中止を表示し、編集前の結果と入力キーを保持する', async () => {
    const { user, workers, calculate, panel, panelElement } = await setup();
    await calculate();
    const original = panel.getByRole('table').textContent;
    workers[0].deferred = true;
    await user.selectOptions(within(screen.getByRole('group', { name: 'スロット 1' })).getByLabelText('必要枚数'), '2');
    await calculate();
    expect(panelElement.querySelector('.result-actions button')).toBeDisabled();
    act(() => workers[0].emit({ type: 'progress', requestId: workers[0].request!.requestId, done: 3, total: 10 }));
    expect(panel.getByRole('progressbar')).toHaveAttribute('value', '3');
    await user.click(panel.getByRole('button', { name: '中止' }));
    expect(panel.getByText('中止しました')).toBeVisible();
    expect(panel.getByText('古い結果（再計算してください）')).toBeVisible();
    expect(panel.getByRole('table').textContent).toBe(original);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(2);
    expect(panelElement.querySelector('.result-actions button')).toBeEnabled();
  });

  it('種類違いを枚数1で解除し、上限8・複製・移動・削除・有効切替を扱う', async () => {
    const { user } = await setup();
    const slot = within(screen.getByRole('group', { name: 'スロット 1' }));
    expect(slot.getByLabelText('種類違い')).toBeDisabled();
    await user.selectOptions(slot.getByLabelText('必要枚数'), '2');
    await user.click(slot.getByLabelText('種類違い'));
    expect(screen.getByText('うらら ×2（種類違い） + 灰流うらら ×1')).toBeVisible();
    await user.selectOptions(slot.getByLabelText('必要枚数'), '1');
    expect(slot.getByLabelText('種類違い')).not.toBeChecked();
    expect(slot.getByLabelText('種類違い')).toBeDisabled();
    for (let i = 2; i < 8; i++) await user.click(screen.getByRole('button', { name: 'スロットを追加' }));
    expect(screen.getByRole('button', { name: 'スロットを追加' })).toBeDisabled();
    const list = within(screen.getByRole('list', { name: 'パターン一覧' }));
    await user.click(list.getByRole('button', { name: '複製' }));
    expect(screen.getByLabelText('パターン名')).toHaveValue('二枚初動のコピー');
    await user.click(list.getByRole('button', { name: '二枚初動のコピーを上へ' }));
    expect(list.getAllByRole('listitem')[0]).toHaveAttribute('aria-label', '二枚初動のコピー');
    expect(list.getByRole('button', { name: '二枚初動のコピーを上へ' })).toBeDisabled();
    await user.click(list.getByRole('button', { name: '二枚初動のコピーを下へ' }));
    const copy = within(list.getByRole('listitem', { name: '二枚初動のコピー' }));
    await user.click(copy.getByRole('button', { name: '削除' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' }));
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    await user.click(copy.getByRole('button', { name: '削除' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(list.getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(screen.getByRole('group', { name: 'スロット 1' })).getByRole('button', { name: 'スロットを削除' }));
    expect(screen.getByRole('button', { name: 'スロットを追加' })).toBeEnabled();
    const name = screen.getByLabelText('パターン名');
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue('二枚初動');
    await user.clear(name);
    await user.type(name, '変更後');
    await user.tab();
    expect(list.getByRole('listitem', { name: '変更後' })).toBeVisible();
  });

  it('グループなしでも特定カードを使え、空グループには注意を出す', async () => {
    const state = initialState(false);
    state.decks[0].groups = [];
    const { user } = await setup(state);
    await user.click(screen.getByRole('button', { name: 'パターンを作成' }));
    expect(screen.getByText(/カードグループを先に作成/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'スロットを追加' }));
    expect((screen.getByLabelText('対象') as HTMLSelectElement).value).toMatch(/^card:/);
    await user.click(screen.getByRole('tab', { name: 'カードグループ' }));
    await user.click(screen.getByRole('button', { name: 'グループを作成' }));
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    await user.type(screen.getByLabelText('キーワード'), '存在しないカード');
    await waitFor(() => expect(screen.getByRole('button', { name: 'グループ 1 0 種 / 0 枚' })).toBeVisible());
    await user.click(screen.getByRole('tab', { name: '初動パターン' }));
    const option = screen.getByRole('option', { name: 'グループ: グループ 1' });
    await user.selectOptions(screen.getByLabelText('対象'), option);
    expect(screen.getByText('このグループに該当するカードがメインデッキにありません')).toBeVisible();
  });

  it('任意枚数は5・6と重複せず、変更時に古い結果を示し、入力制限で計算を無効にする', async () => {
    const state = initialState();
    state.decks[0].entries[1].count = 3;
    const { user, workers, calculate, panel, panelElement } = await setup(state);
    await user.selectOptions(panel.getByLabelText('追加の手札枚数'), '5');
    await calculate();
    expect(workers[0].request?.input.handSizes).toEqual([5, 6]);
    await user.selectOptions(panel.getByLabelText('追加の手札枚数'), '1');
    expect(panel.getByText('古い結果（再計算してください）')).toBeVisible();
    await calculate();
    expect(workers[0].request?.input.handSizes).toEqual([5, 6, 1]);
    expect(panel.getByRole('row', { name: /任意 1 枚/ })).toBeVisible();
    await user.selectOptions(panel.getByLabelText('追加の手札枚数'), '10');
    expect(panel.getByText('手札枚数 10 はメインデッキの枚数（6 枚）を超えています')).toBeVisible();
    expect(panelElement.querySelector('.result-actions button')).toBeDisabled();
  });

  it.each([0, 61])('メイン %i 枚の計算を理由つきで無効にする', async count => {
    const state = initialState();
    state.decks[0].entries = count === 0 ? [] : [
      { cardId: 'k12950', name: '灰流うらら', count: 60, section: 'main' },
      { cardId: 'k551', name: 'その他', count: 1, section: 'main' },
    ];
    const { panelElement } = await setup(state);
    expect(panelElement.querySelector('.result-actions button')).toBeDisabled();
    expect(panelElement.querySelector('#calculation-reason')).toHaveTextContent(count === 0 ? '手札枚数 5' : '60 枚を超えている');
  });

  it('サンプリングの95%区間・大小逆転の注記・エラーを表示し、展開状態を切り替える', async () => {
    const { workers, calculate, panel, panelElement } = await setup(initialState(), true);
    const toggle = panelElement.querySelector<HTMLButtonElement>('.result-toggle')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panelElement).toHaveClass('result-panel-expanded');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await calculate();
    await act(async () => workers[0].emit({ type: 'result', requestId: workers[0].request!.requestId, results: [
      { handSize: 5, elapsedMs: 120, success: { p: 0.8743, method: 'sampling', lo: 0.8728, hi: 0.8758 },
        perPattern: { p1: { p: 0.88, method: 'exact' } } },
    ] }));
    expect(panel.getByText('（87.28〜87.58%）')).toBeInTheDocument();
    expect(panel.getByText('サンプリング')).toBeInTheDocument();
    expect(panel.getByText(/サンプリングの誤差により/)).toBeInTheDocument();
    expect(panel.getByText('計算時間 0.12 秒')).toBeInTheDocument();
    await calculate();
    await act(async () => workers[0].emit({ type: 'error', requestId: workers[0].request!.requestId, message: '計算に失敗しました' }));
    expect(panel.getByRole('alert')).toHaveTextContent('計算に失敗しました');
    expect(panel.getByRole('table')).toBeInTheDocument();
  });

  it('入力キーはオブジェクトのキー順によらず、配列と値の変更は区別する', () => {
    const compiled = compile(initialState().decks[0], db.getCard, [5, 6]);
    if (!compiled.ok) throw new Error(compiled.error);
    const input = compiled.value;
    const reordered = JSON.parse(JSON.stringify(input, (_key, value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse()) : value)) as EngineInput;
    expect(stableInputKey(reordered)).toBe(stableInputKey(input));
    expect(stableInputKey({ ...input, handSizes: [6, 5] })).not.toBe(stableInputKey(input));
    expect(stableInputKey({ ...input, otherCount: input.otherCount + 1 })).not.toBe(stableInputKey(input));
  });
});
