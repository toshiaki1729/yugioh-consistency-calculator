import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import type { AppState } from '../src/domain/types';
import { STORAGE_KEY } from '../src/state/persist';
import { createInitialState } from '../src/state/reducer';
import { FakeEngineWorker } from './fixtures/engineWorker';

const deckNote = /計算では、初動に関係しないカード/;
const resultNote = /メイン \d+ 枚に \d+ 枚補って計算しています/;
const staleNote = '古い結果（再計算してください）';
const fillNote = 'メインデッキの枚数が入力した枚数より少ないとき、足りない分を初動に関係しないカードとして加えて計算します';
const invalidNote = '40〜60 の整数を入力してください（この値は保存されていません）。';
type User = ReturnType<typeof userEvent.setup>;

/** チェックを外すか、チェックを入れて枚数を入力し直す。 */
async function setTarget(user: User, target: number | null) {
  const checkbox = screen.getByRole('checkbox', { name: '足りない分を補う' });
  if (target === null) {
    if ((checkbox as HTMLInputElement).checked) await user.click(checkbox);
    return;
  }
  if (!(checkbox as HTMLInputElement).checked) await user.click(checkbox);
  const field = screen.getByRole('textbox', { name: '補った後の枚数' });
  await user.clear(field);
  await user.type(field, String(target));
}

function setup(mainCount = 35, target?: number) {
  const state = createInitialState();
  const deck = state.decks[0];
  deck.entries = [
    { cardId: 'k1', name: '初動 A', count: 3, section: 'main' },
    { cardId: 'k2', name: '無関係', count: mainCount - 3, section: 'main' },
    { cardId: 'k1', name: '初動 A', count: 10, section: 'extra' },
    { cardId: 'k2', name: '無関係', count: 15, section: 'side' },
  ];
  deck.patterns = [{ id: 'p1', name: 'A を 1 枚', enabled: true, conditions: [], slots: [
    { id: 's1', source: { type: 'card', cardId: 'k1' }, count: 1, distinctNames: false },
  ] }];
  if (target !== undefined) deck.mainFillTarget = target;
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  const db = createCardDb({ version: 1, source: 'yaml-yugi', generatedAt: '', cards: [] });
  const worker = new FakeEngineWorker();
  render(<StrictMode><App db={db} storage={storage} createWorker={() => worker} /></StrictMode>);
  const panelElement = screen.getByRole('complementary', { name: '計算結果' });
  const detail = within(panelElement.querySelector<HTMLElement>('#result-detail')!);
  const bar = within(panelElement.querySelector<HTMLElement>('.result-bar')!);
  return {
    user: userEvent.setup(), worker, detail, bar,
    checkbox: screen.getByRole<HTMLInputElement>('checkbox', { name: '足りない分を補う' }),
    field: screen.getByRole<HTMLInputElement>('textbox', { name: '補った後の枚数' }),
    savedDeck: () => (JSON.parse(values.get(STORAGE_KEY)!) as AppState).decks[0],
  };
}

describe('メインデッキを補う設定の画面', () => {
  it('初期値・保存・解除と、メインだけの枚数表示を確認する', async () => {
    const { user, checkbox, field, savedDeck, detail } = setup();
    expect(checkbox).not.toBeChecked();
    expect(field).toBeDisabled();
    expect(field).toHaveValue('40');
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(field).toBeEnabled();
    expect(screen.getByText(deckNote))
      .toHaveTextContent('計算では、初動に関係しないカードを 5 枚補って 40 枚にします');
    expect(screen.getByText(/メインデッキは 40〜60 枚を推奨します。/)).toHaveTextContent('現在 35 枚');
    expect(screen.getByText(fillNote)).toHaveClass('DeckView-note');
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    await waitFor(() => expect(savedDeck().mainFillTarget).toBe(40));
    await user.click(checkbox);
    expect(field).toBeDisabled();
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    await waitFor(() => expect(savedDeck()).not.toHaveProperty('mainFillTarget'));
  });

  it('保存済みの設定を入力欄に表示する', () => {
    const { checkbox, field } = setup(35, 45);
    expect(checkbox).toBeChecked();
    expect(field).toHaveValue('45');
    expect(screen.getByText(deckNote)).toHaveTextContent('10 枚補って 45 枚にします');
  });

  it('範囲外の入力は保存せずに注意を出し、範囲内に直すと保存する', async () => {
    const { user, field, savedDeck } = setup(35, 45);
    await user.clear(field);
    await user.type(field, '61');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(invalidNote)).toBeVisible();
    expect(screen.getByText(deckNote)).toHaveTextContent('10 枚補って 45 枚にします');
    await user.clear(field);
    expect(screen.getByText(invalidNote)).toBeVisible();
    await user.type(field, '50');
    expect(screen.queryByText(invalidNote)).not.toBeInTheDocument();
    expect(screen.getByText(deckNote)).toHaveTextContent('15 枚補って 50 枚にします');
    await waitFor(() => expect(savedDeck().mainFillTarget).toBe(50));
  });

  it('入力欄が範囲外のままチェックを外して入れ直すと 40 枚で補う', async () => {
    const { user, checkbox, field, savedDeck } = setup(35, 45);
    await user.clear(field);
    await user.type(field, '7');
    await user.click(checkbox);
    expect(screen.queryByText(invalidNote)).not.toBeInTheDocument();
    await user.click(checkbox);
    expect(field).toHaveValue('40');
    await waitFor(() => expect(savedDeck().mainFillTarget).toBe(40));
  });

  it('補った結果の案内は詳細だけに出し、40 → 45 の変更で古い結果になって消える', async () => {
    const { user, detail, bar, worker } = setup(35, 40);
    await user.click(detail.getByRole('button', { name: '計算する' }));
    expect(await detail.findByText(resultNote)).toHaveTextContent('メイン 35 枚に 5 枚補って計算しています');
    expect(bar.queryByText(resultNote)).not.toBeInTheDocument();
    expect(worker.request?.input).toMatchObject({ mode: 'classes', input: { deckSize: 40 } });
    expect(detail.getByRole('row', { name: /先攻 5 枚/ })).toHaveTextContent('33.76%');
    await user.click(bar.getByRole('button', { name: '計算結果を展開する' }));
    expect(bar.getByRole('button', { name: '計算結果を折りたたむ' })).toHaveAttribute('aria-expanded', 'true');
    expect(detail.getByText(resultNote)).toBeVisible();
    await setTarget(user, 45);
    expect(detail.getByText(staleNote)).toBeVisible();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    expect(screen.getByText(deckNote)).toHaveTextContent('10 枚補って 45 枚にします');
    await user.click(detail.getByRole('button', { name: '計算する' }));
    expect(await detail.findByText(resultNote)).toHaveTextContent('メイン 35 枚に 10 枚補って計算しています');
    expect(detail.queryByText(staleNote)).not.toBeInTheDocument();
  });

  it('補った計算の後に解除すると案内が消え、再計算は実際の 35 枚を使う', async () => {
    const { user, detail, worker } = setup(35, 40);
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await detail.findByText(resultNote);
    await setTarget(user, null);
    expect(detail.getByText(staleNote)).toBeVisible();
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await detail.findByText('計算が完了しました');
    expect(worker.request?.input).toMatchObject({ mode: 'classes', input: { deckSize: 35 } });
    expect(detail.getByRole('row', { name: /先攻 5 枚/ })).toHaveTextContent('37.97%');
    expect(detail.queryByText(staleNote)).not.toBeInTheDocument();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
  });

  it.each([40, 50])('メイン %i 枚で 40 枚に設定しても補う案内を出さない', async mainCount => {
    const { user, detail } = setup(mainCount, 40);
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await detail.findByText('計算が完了しました');
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
  });

  it('メイン 61 枚では補う案内を出さず、既存の注意と計算不可を保つ', () => {
    const { detail } = setup(61, 60);
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    expect(screen.getByText(/計算できません（60 枚まで）/)).toHaveTextContent('現在 61 枚');
    expect(detail.getByRole('button', { name: '計算する' })).toBeDisabled();
  });

  it('メイン 50 枚で補わない → 40 枚にしても結果は古くならない', async () => {
    const { user, detail } = setup(50);
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await detail.findByText('計算が完了しました');
    await setTarget(user, 40);
    expect(detail.queryByText(staleNote)).not.toBeInTheDocument();
    expect(detail.getByRole('table', { name: '初動率' })).toBeVisible();
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
  });

  it.each([false, true])('計算中に設定を変えると完了後も補う案内を出さない（前の結果: %s）', async hasPrevious => {
    const { user, detail, worker } = setup(35, 40);
    if (hasPrevious) {
      await user.click(detail.getByRole('button', { name: '計算する' }));
      await detail.findByText(resultNote);
    }
    worker.deferred = true;
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await setTarget(user, 45);
    expect(detail.getByText('計算中')).toBeVisible();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    if (hasPrevious) expect(detail.getByText(staleNote)).toBeVisible();
    await act(async () => worker.complete());
    expect(detail.getByText(staleNote)).toBeVisible();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
  });
});
