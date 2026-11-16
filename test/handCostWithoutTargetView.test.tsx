import { StrictMode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import type { AppState } from '../src/domain/types';
import { STORAGE_KEY } from '../src/state/persist';
import { HandCostFields } from '../src/ui/effects/StepTargetFields';
import { FakeEngineWorker } from './fixtures/engineWorker';
import { createEffectsState, groupTarget } from './fixtures/effectsDeck';
import sample from './fixtures/yaml-yugi-sample.json';

const db = createCardDb(convertCards(sample, '2026-11-15T00:00:00.000Z').db);
const checkboxLabel = '使う前の手札に対象が無くても使う';
const destinationLabel = '対象が無いときの手札の行き先';
const note = 'この手順を処理するときに対象が無ければ、その時点の手札をすべて指定した行き先へ送ります';

async function setup(state = createEffectsState()) {
  const stored = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  };
  const view = render(<StrictMode><App storage={storage} db={db}
    createWorker={() => new FakeEngineWorker()} /></StrictMode>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'ドロー効果' }));
  function readState() {
    fireEvent(window, new Event('pagehide'));
    return JSON.parse(stored.get(STORAGE_KEY)!) as AppState;
  }
  return { user, readState, unmount: view.unmount };
}

describe('手放す対象が無くても使う設定', () => {
  it('既定は項目なしで、設定と送り先を保存し、再読み込み後に解除できる', async () => {
    const { user, readState, unmount } = await setup();
    await user.selectOptions(screen.getByLabelText('手順の種類'), 'handCost');
    expect(screen.getByLabelText(checkboxLabel)).not.toBeChecked();
    expect(screen.queryByLabelText(destinationLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    expect(readState().decks[0].effects[0].steps[0]).not.toHaveProperty('whenMissing');
    await user.click(screen.getByLabelText(checkboxLabel));
    expect(screen.getByLabelText(destinationLabel)).toHaveValue('graveyard');
    expect(screen.getByText(note)).toBeVisible();
    expect(readState().decks[0].effects[0].steps[0]).toHaveProperty('whenMissing', 'graveyard');
    await user.selectOptions(screen.getByLabelText(destinationLabel), 'banishedFaceUp');
    const saved = readState();
    expect(saved.decks[0].effects[0].steps[0]).toEqual({
      kind: 'handCost', target: groupTarget, destination: 'graveyard', whenMissing: 'banishedFaceUp',
    });
    const list = within(screen.getByRole('list', { name: 'ドロー効果一覧' }));
    expect(list.getByText('手札から 1 枚を墓地へ送る（無ければ手札をすべて表側で除外）')).toBeVisible();
    unmount();
    const reopened = await setup(saved);
    expect(screen.getByLabelText(checkboxLabel)).toBeChecked();
    expect(screen.getByLabelText(destinationLabel)).toHaveValue('banishedFaceUp');
    await reopened.user.click(screen.getByLabelText(checkboxLabel));
    expect(reopened.readState().decks[0].effects[0].steps[0]).not.toHaveProperty('whenMissing');
    expect(screen.queryByLabelText(destinationLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    expect(screen.getByText('手札から 1 枚を墓地へ送る')).toBeVisible();
  });

  it.each([
    ['graveyard', '（無ければ手札をすべて墓地へ）'],
    ['banishedFaceUp', '（無ければ手札をすべて表側で除外）'],
  ] as const)('保存済みの %s を表示し、通常の送り先とは独立して編集する', async (whenMissing, suffix) => {
    const state = createEffectsState();
    state.decks[0].effects[0].steps = [{
      kind: 'handCost', target: groupTarget, destination: 'banishedFaceUp', whenMissing,
    }];
    const { user, readState } = await setup(state);
    expect(screen.getByLabelText(checkboxLabel)).toBeChecked();
    expect(screen.getByLabelText(destinationLabel)).toHaveValue(whenMissing);
    expect(screen.getByText(`手札から 1 枚を表側で除外${suffix}`)).toBeVisible();
    await user.selectOptions(screen.getByLabelText('送り先'), 'graveyard');
    expect(readState().decks[0].effects[0].steps[0]).toMatchObject({ destination: 'graveyard', whenMissing });
    expect(screen.getByText(`手札から 1 枚を墓地へ送る${suffix}`)).toBeVisible();
  });

  it('チェックを外した下書きは、JSON 化する前から whenMissing キーを持たない', async () => {
    const onChange = vi.fn();
    const step = {
      kind: 'handCost', target: groupTarget, destination: 'banishedFaceUp', whenMissing: 'graveyard',
    } as const;
    render(<HandCostFields step={step} sources={[
      { value: 'group:g1', name: '対象', source: groupTarget },
    ]} onChange={onChange} />);
    await userEvent.setup().click(screen.getByLabelText(checkboxLabel));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      kind: 'handCost', target: groupTarget, destination: 'banishedFaceUp',
    });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty('whenMissing');
    expect(step.whenMissing).toBe('graveyard');
  });
});
