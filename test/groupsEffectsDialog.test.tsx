import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardDbProvider } from '../src/carddb/useCardDb';
import { createCardDb } from '../src/carddb/loader';
import type { CardData } from '../src/domain/types';
import { AppStateProvider, useAppState } from '../src/state/store';
import { STORAGE_KEY } from '../src/state/persist';
import { GroupsView } from '../src/ui/groups/GroupsView';
import { createEffect, createEffectsState, groupTarget } from './fixtures/effectsDeck';

function GroupsHarness() {
  const { activeDeck } = useAppState();
  return activeDeck && <><GroupsView deck={activeDeck} /><output data-testid="deck">{JSON.stringify(activeDeck)}</output></>;
}

async function setup() {
  const state = createEffectsState();
  const deck = state.decks[0];
  const card: CardData = { id: 'k1', name: 'DBの名前', kind: 'spell', monsterTypes: [], text: '' };
  const db = createCardDb({ version: 1, source: 'yaml-yugi', generatedAt: '2026-11-15T00:00:00.000Z', cards: [card] });
  deck.customCards = [{ ...card, id: 'c:custom', name: 'カスタムの名前', custom: true }];
  deck.pageData = { k1: { ...card, name: 'DBより優先しないページ名' }, k4: { ...card, id: 'k4', name: 'ページの名前' } };
  deck.entries.push(
    { cardId: 'k2', name: 'メインの保存名', count: 1, section: 'main' },
    { cardId: 'k3', name: 'サイドの名前は使わない', count: 1, section: 'side' },
    { cardId: 'c:custom', name: '古いカスタム名', count: 1, section: 'main' },
  );
  deck.patterns.push({
    id: 'p2', name: 'スロットと条件の両方', enabled: false,
    slots: [{ id: 's1', source: groupTarget, count: 1, distinctNames: false }],
    conditions: [{ kind: 'movedExcludes', target: groupTarget, zones: ['graveyard'] }],
  }, {
    id: 'p3', name: '無関係のパターン', enabled: true, slots: [],
    conditions: [{ kind: 'deckAtLeast', count: 1, target: { type: 'card', cardId: 'k2' } }],
  });
  deck.effects = ['k1', 'k2', 'k3', 'k4', 'c:custom'].map((cardId, index) => ({
    ...createEffect(), id: `e${index}`, cardId,
    steps: [{ kind: 'draw', count: 1 }, { kind: 'search', target: groupTarget }],
  }));
  deck.effects.push({ ...createEffect(), id: 'retained', cardId: 'k5', steps: [{ kind: 'excavate', count: 1, target: null }] });
  const storage = { getItem: (key: string) => key === STORAGE_KEY ? JSON.stringify(state) : null, setItem: vi.fn() };
  render(<AppStateProvider storage={storage}><CardDbProvider db={db}><GroupsHarness /></CardDbProvider></AppStateProvider>);
  return { user: userEvent.setup(), deck };
}

describe('条件・効果を参照するグループの削除確認', () => {
  it('条件だけの参照と効果の解決済みカード名・メイン保存名・IDを表示し、キャンセルで保持する', async () => {
    const { user, deck } = await setup();
    await user.click(screen.getByRole('button', { name: '削除' }));
    const dialog = within(screen.getByRole('dialog', { name: 'グループを削除' }));
    expect(dialog.getByText('条件だけ')).toBeVisible();
    expect(dialog.getAllByText('スロットと条件の両方')).toHaveLength(1);
    expect(dialog.queryByText('無関係のパターン')).not.toBeInTheDocument();
    expect(dialog.getByText('これらのパターンから該当するスロットや追加の条件も削除されます。')).toBeVisible();
    for (const name of ['DBの名前', 'メインの保存名', 'k3', 'ページの名前', 'カスタムの名前']) {
      expect(dialog.getByText(name)).toBeVisible();
    }
    expect(dialog.queryByText('DBより優先しないページ名')).not.toBeInTheDocument();
    expect(dialog.queryByText('サイドの名前は使わない')).not.toBeInTheDocument();
    expect(dialog.queryByText('k5')).not.toBeInTheDocument();
    expect(dialog.getByText('これらのドロー効果も削除されます。')).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('deck').textContent!)).toEqual(deck);
  });

  it('確認して削除すると、表示したパターンの参照と効果だけを削除する', async () => {
    const { user, deck } = await setup();
    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    const updated = JSON.parse(screen.getByTestId('deck').textContent!);
    expect(updated.groups).toEqual([]);
    expect(updated.patterns.slice(0, 2).map((pattern: { conditions: unknown[]; slots: unknown[] }) => [pattern.conditions, pattern.slots])).toEqual([[[], []], [[], []]]);
    expect(updated.patterns[2]).toEqual(deck.patterns[2]);
    expect(updated.effects).toEqual([deck.effects[5]]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
