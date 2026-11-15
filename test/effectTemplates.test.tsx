import { StrictMode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import type { AppState, DrawEffect } from '../src/domain/types';
import { STORAGE_KEY } from '../src/state/persist';
import { createEffectsState } from './fixtures/effectsDeck';
import { FakeEngineWorker } from './fixtures/engineWorker';

const db = createCardDb({ version: 1, source: 'yaml-yugi', generatedAt: '', cards: [] });
const original: DrawEffect = {
  id: 'e1', cardId: 'k1', oncePerTurn: true, firstOnly: true, drawLock: 'after',
  steps: [{ kind: 'banishTop', count: 2 }, { kind: 'draw', count: 3 }],
};

async function setup() {
  const state = createEffectsState();
  state.decks[0].effects = [structuredClone(original)];
  let stored = JSON.stringify(state);
  const storage = {
    getItem: (key: string) => key === STORAGE_KEY ? stored : null,
    setItem: vi.fn((key: string, value: string) => { if (key === STORAGE_KEY) stored = value; }),
  };
  render(<StrictMode><App db={db} storage={storage}
    createWorker={() => new FakeEngineWorker()} /></StrictMode>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'ドロー効果' }));
  function readEffect() {
    fireEvent(window, new Event('pagehide'));
    return (JSON.parse(stored) as AppState).decks[0].effects[0];
  }
  readEffect();
  storage.setItem.mockClear();
  return { user, readEffect, storage };
}

const editor = () => within(screen.getByRole('region', { name: 'ドロー効果の編集' }));
const stepRow = (index: number) => within(screen.getByRole('group', { name: `手順 ${index}` }));

const templates: { name: string; oncePerTurn: boolean; drawLock: DrawEffect['drawLock'];
  steps: DrawEffect['steps']; missingRow?: number }[] = [
  { name: '1 枚ドロー', oncePerTurn: false, drawLock: 'none', steps: [{ kind: 'draw', count: 1 }] },
  { name: '上から除外して 2 枚ドロー', oncePerTurn: true, drawLock: 'none',
    steps: [{ kind: 'banishTop', count: 10 }, { kind: 'draw', count: 2 }] },
  { name: 'めくって 1 枚を手札に', oncePerTurn: true, drawLock: 'turn',
    steps: [{ kind: 'excavate', count: 6, target: null }] },
  { name: '2 枚ドローして手札から 1 枚除外', oncePerTurn: false, drawLock: 'none', missingRow: 2,
    steps: [{ kind: 'draw', count: 2 },
      { kind: 'handCost', target: { type: 'group', groupId: 'g1' }, destination: 'banishedFaceUp' }] },
  { name: 'サーチして 1 枚ドロー', oncePerTurn: true, drawLock: 'none', missingRow: 1,
    steps: [{ kind: 'search', target: { type: 'group', groupId: 'g1' } }, { kind: 'draw', count: 1 }] },
];

describe('ドロー効果のひな形', () => {
  it.each(templates)('$name: 確認・キャンセル・承認と設定および手順の保存', async template => {
    const { user, readEffect, storage } = await setup();
    await user.click(editor().getByRole('button', { name: template.name }));
    expect(screen.getByRole('dialog')).toHaveTextContent(`現在の設定と手順を「${template.name}」のひな形で置き換えますか？`);
    expect(readEffect()).toEqual(original);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readEffect()).toEqual(original);
    expect(editor().getByLabelText('最初の効果としてだけ使える')).toBeChecked();
    expect(stepRow(1).getByLabelText('除外枚数')).toHaveValue('2');
    expect(stepRow(2).getByLabelText('ドロー枚数')).toHaveValue('3');
    storage.setItem.mockClear();
    await user.click(editor().getByRole('button', { name: template.name }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '置き換える' }));
    expect(editor().getByLabelText('カード')).toHaveValue(original.cardId);
    expect(editor().getByLabelText('1 ターンに 1 回')).toHaveProperty('checked', template.oncePerTurn);
    expect(editor().getByLabelText('最初の効果としてだけ使える')).not.toBeChecked();
    expect(editor().getByLabelText('ドローの制限')).toHaveValue(template.drawLock);
    expect(editor().getAllByRole('group', { name: /^手順 \d+$/ })).toHaveLength(template.steps.length);
    if (template.missingRow) {
      expect(stepRow(template.missingRow).getByLabelText('対象')).toHaveValue('');
      expect(stepRow(template.missingRow).getByRole('option', { name: '未設定' })).toBeDisabled();
      expect(stepRow(template.missingRow).getByRole('status')).toHaveTextContent('設定と手順の変更は保存されません');
      expect(readEffect()).toEqual(original);
      expect(storage.setItem).not.toHaveBeenCalled();
      await user.selectOptions(stepRow(template.missingRow).getByLabelText('対象'), 'group:g1');
    }
    expect(readEffect()).toEqual({ id: original.id, cardId: original.cardId,
      oncePerTurn: template.oncePerTurn, firstOnly: false, drawLock: template.drawLock, steps: template.steps });
    if (template.steps[0].kind === 'excavate') {
      expect(stepRow(1).getByLabelText('対象')).toHaveValue('');
      expect(stepRow(1).getByRole('option', { name: '何でも' })).toBeEnabled();
    }
  });

  it('未設定の間の設定変更も保持し、対象の確定時に一緒に保存する', async () => {
    const { user, readEffect, storage } = await setup();
    await user.click(editor().getByRole('button', { name: 'サーチして 1 枚ドロー' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '置き換える' }));
    await user.click(editor().getByLabelText('1 ターンに 1 回'));
    await user.click(editor().getByLabelText('最初の効果としてだけ使える'));
    await user.selectOptions(editor().getByLabelText('ドローの制限'), 'turn');
    expect(readEffect()).toEqual(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    await user.selectOptions(stepRow(1).getByLabelText('対象'), 'card:k1');
    expect(readEffect()).toEqual({ ...original, oncePerTurn: false, firstOnly: true, drawLock: 'turn',
      steps: [{ kind: 'search', target: { type: 'card', cardId: 'k1' } }, { kind: 'draw', count: 1 }] });
  });

  it('キャンセルは未確定値を保ち、同じひな形の再適用も未確定値を置き換える', async () => {
    const { user, readEffect } = await setup();
    async function openTemplate() {
      await user.click(editor().getByRole('button', { name: '1 枚ドロー' }));
    }
    async function confirm() {
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '置き換える' }));
    }
    await openTemplate();
    await confirm();
    fireEvent.change(stepRow(1).getByLabelText('ドロー枚数'), { target: { value: '99' } });
    await openTemplate();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' }));
    expect(stepRow(1).getByLabelText('ドロー枚数')).toHaveValue('99');
    await openTemplate();
    await confirm();
    expect(stepRow(1).getByLabelText('ドロー枚数')).toHaveValue('1');
    expect(stepRow(1).queryByRole('status')).not.toBeInTheDocument();
    expect(readEffect().steps).toEqual([{ kind: 'draw', count: 1 }]);
  });

  it('使う順序・選択時の情報・近似の範囲の説明を表示する', async () => {
    await setup();
    expect(screen.getByText('手札が初動になっていないときだけ、一覧の上から順に、使えるドロー効果を 1 つずつ使います。初動になったと判断した時点で使うのをやめます。')).toBeVisible();
    expect(screen.getByText('効果で選ぶカード（めくったカード・サーチ先・手放すカード）は、その時点の手札など、分かっている情報だけで決めます。この後に引くカードは見ません。')).toBeVisible();
    expect(screen.getByText('計算できるのは、最初のターンにドロー効果で手札を増やす部分の近似です。特殊召喚の制限など、効果のそれ以外の部分は計算に含まれません。')).toBeVisible();
  });
});
