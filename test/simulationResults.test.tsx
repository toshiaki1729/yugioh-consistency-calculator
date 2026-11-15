import { StrictMode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import type { Estimate } from '../src/engine/types';
import { STORAGE_KEY } from '../src/state/persist';
import { createEffectsState } from './fixtures/effectsDeck';
import { FakeEngineWorker } from './fixtures/engineWorker';

async function setup(method: Estimate['method'], hasInversion: boolean) {
  const state = createEffectsState();
  state.decks[0].entries[0].count = 40;
  const storage = { getItem: (key: string) => key === STORAGE_KEY ? JSON.stringify(state) : null,
    setItem: vi.fn() };
  const db = createCardDb({ version: 1, source: 'yaml-yugi', generatedAt: '', cards: [] });
  const worker = new FakeEngineWorker();
  worker.deferred = true;
  render(<StrictMode><App db={db} storage={storage} createWorker={() => worker} /></StrictMode>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: '初動パターン' }));
  const panelElement = screen.getByRole('complementary', { name: '計算結果' });
  await user.click(panelElement.querySelector<HTMLButtonElement>('.result-actions button')!);
  const success: Estimate = { method, samples: 200000, p: 0.6, lo: 0.59, hi: 0.61 };
  const pattern: Estimate = { method, samples: 200000, p: hasInversion ? 0.7 : 0.6, lo: 0.58, hi: 0.72 };
  await act(async () => worker.emit({ type: 'result', requestId: worker.request!.requestId, results: [
    { handSize: 5, elapsedMs: 100, success, perPattern: { p1: pattern } },
  ] }));
  return { panel: within(panelElement), panelElement, worker };
}

it('Workerのシミュレーション結果を方式・回数・区間・専用の逆転注記で表示する', async () => {
  const { panel, panelElement, worker } = await setup('simulation', true);
  expect(worker.request?.input.mode).toBe('simulation');
  expect(panel.getByText('シミュレーション（20 万回）')).toBeVisible();
  const table = within(panel.getByRole('table', { name: '初動率' }));
  expect(table.getByLabelText('95% 信頼区間')).toHaveTextContent('（59.00〜61.00%）');
  expect(within(panelElement.querySelector<HTMLElement>('.result-bar')!)
    .getByLabelText('95% 信頼区間')).toHaveTextContent('（59.00〜61.00%）');
  expect(within(panelElement.querySelector<HTMLElement>('.result-patterns')!)
    .getByLabelText('95% 信頼区間')).toHaveTextContent('（58.00〜72.00%）');
  expect(within(screen.getByRole('list', { name: 'パターン一覧' }))
    .getByLabelText('95% 信頼区間')).toHaveTextContent('（58.00〜72.00%）');
  expect(panel.getByText(/シミュレーションでは、全体と各パターンを別々に判定します/))
    .toHaveTextContent('「デッキの上から除外しても残っている」の条件で不成立になる場合');
  expect(panel.queryByText(/サンプリングの誤差により/)).not.toBeInTheDocument();
});

it('シミュレーションで全体と単独が同じ値なら逆転注記を表示しない', async () => {
  const { panel } = await setup('simulation', false);
  expect(panel.queryByText(/全体の値が単独パターンの値を下回る/)).not.toBeInTheDocument();
});

it.each(['exact', 'sampling'] as const)('%s の方式と注記を維持する', async method => {
  const { panel } = await setup(method, true);
  expect(panel.getByText(method === 'exact' ? '厳密' : 'サンプリング')).toBeVisible();
  expect(panel.queryByText(/シミュレーションでは/)).not.toBeInTheDocument();
  if (method === 'sampling') expect(panel.getByText(/サンプリングの誤差により/)).toBeVisible();
  else expect(panel.queryByLabelText('95% 信頼区間')).not.toBeInTheDocument();
});
