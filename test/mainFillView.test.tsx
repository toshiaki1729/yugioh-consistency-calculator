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
    select: screen.getByRole('combobox', { name: '足りない分を補う' }),
    savedDeck: () => (JSON.parse(values.get(STORAGE_KEY)!) as AppState).decks[0],
  };
}

describe('メインデッキを補う設定の画面', () => {
  it('初期値・22 個の選択肢・保存・解除と、メインだけの枚数表示を確認する', async () => {
    const { user, select, savedDeck, detail } = setup();
    expect(select).toHaveDisplayValue('補わない');
    const options = within(select).getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      '補わない', ...Array.from({ length: 21 }, (_, index) => `${40 + index} 枚まで`),
    ]);
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    await user.selectOptions(select, '40');
    expect(select).toHaveDisplayValue('40 枚まで');
    expect(screen.getByText(deckNote))
      .toHaveTextContent('計算では、初動に関係しないカードを 5 枚補って 40 枚にします');
    expect(screen.getByText(/メインデッキは 40〜60 枚を推奨します。/)).toHaveTextContent('現在 35 枚');
    expect(screen.getByText('メインデッキが選んだ枚数より少ないとき、足りない分を初動に関係しないカードとして加えて計算します'))
      .toHaveClass('DeckView-note');
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    await waitFor(() => expect(savedDeck().mainFillTarget).toBe(40));
    await user.selectOptions(select, '');
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    await waitFor(() => expect(savedDeck()).not.toHaveProperty('mainFillTarget'));
  });

  it('保存済みの設定を選択状態で表示する', () => {
    const { select } = setup(35, 45);
    expect(select).toHaveDisplayValue('45 枚まで');
    expect(screen.getByText(deckNote)).toHaveTextContent('10 枚補って 45 枚にします');
  });

  it('補った結果の案内は詳細だけに出し、40 → 45 の変更で古い結果になって消える', async () => {
    const { user, select, detail, bar, worker } = setup(35, 40);
    await user.click(detail.getByRole('button', { name: '計算する' }));
    expect(await detail.findByText(resultNote)).toHaveTextContent('メイン 35 枚に 5 枚補って計算しています');
    expect(bar.queryByText(resultNote)).not.toBeInTheDocument();
    expect(worker.request?.input).toMatchObject({ mode: 'classes', input: { deckSize: 40 } });
    expect(detail.getByRole('row', { name: /先攻 5 枚/ })).toHaveTextContent('33.76%');
    await user.click(bar.getByRole('button', { name: '計算結果を展開する' }));
    expect(bar.getByRole('button', { name: '計算結果を折りたたむ' })).toHaveAttribute('aria-expanded', 'true');
    expect(detail.getByText(resultNote)).toBeVisible();
    await user.selectOptions(select, '45');
    expect(detail.getByText(staleNote)).toBeVisible();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    expect(screen.getByText(deckNote)).toHaveTextContent('10 枚補って 45 枚にします');
    await user.click(detail.getByRole('button', { name: '計算する' }));
    expect(await detail.findByText(resultNote)).toHaveTextContent('メイン 35 枚に 10 枚補って計算しています');
    expect(detail.queryByText(staleNote)).not.toBeInTheDocument();
  });

  it('補った計算の後に解除すると案内が消え、再計算は実際の 35 枚を使う', async () => {
    const { user, select, detail, worker } = setup(35, 40);
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await detail.findByText(resultNote);
    await user.selectOptions(select, '');
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

  it.each([40, 50])('メイン %i 枚で 40 枚までを選んでも補う案内を出さない', async mainCount => {
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

  it('メイン 50 枚で補わない → 40 にしても結果は古くならない', async () => {
    const { user, select, detail } = setup(50);
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await detail.findByText('計算が完了しました');
    await user.selectOptions(select, '40');
    expect(detail.queryByText(staleNote)).not.toBeInTheDocument();
    expect(detail.getByRole('table', { name: '初動率' })).toBeVisible();
    expect(screen.queryByText(deckNote)).not.toBeInTheDocument();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
  });

  it.each([false, true])('計算中に設定を変えると完了後も補う案内を出さない（前の結果: %s）', async hasPrevious => {
    const { user, select, detail, worker } = setup(35, 40);
    if (hasPrevious) {
      await user.click(detail.getByRole('button', { name: '計算する' }));
      await detail.findByText(resultNote);
    }
    worker.deferred = true;
    await user.click(detail.getByRole('button', { name: '計算する' }));
    await user.selectOptions(select, '45');
    expect(detail.getByText('計算中')).toBeVisible();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
    if (hasPrevious) expect(detail.getByText(staleNote)).toBeVisible();
    await act(async () => worker.complete());
    expect(detail.getByText(staleNote)).toBeVisible();
    expect(detail.queryByText(resultNote)).not.toBeInTheDocument();
  });
});
