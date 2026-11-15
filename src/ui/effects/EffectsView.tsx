import { useState } from 'react';
import { useResolveCard } from '../../carddb/useCardDb';
import { MAX_DRAW_EFFECTS, MIN_DRAW_COUNT } from '../../domain/limits';
import type { Deck } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import type { SlotOption } from '../patterns/SlotRow';
import { EffectEditor } from './EffectEditor';
import { EffectListRow } from './EffectListRow';
import './EffectsView.css';

/** 優先順に並ぶドロー効果と、選択中の効果の編集を表示する。 */
export function EffectsView({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const [selectedId, setSelectedId] = useState<string | null>(deck.effects[0]?.id ?? null);
  const selected = deck.effects.find(effect => effect.id === selectedId) ?? deck.effects.at(-1);
  const cards = deck.entries.filter(entry => entry.section === 'main').map(entry => ({
    ...entry, name: resolveCard(entry.cardId)?.name ?? entry.name,
  })).sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  const available = cards.filter(card =>
    !deck.effects.some(effect => effect.cardId === card.cardId));
  const sources: SlotOption[] = [
    ...deck.groups.map(group => ({ value: `group:${group.id}`, name: group.name,
      source: { type: 'group' as const, groupId: group.id } })),
    ...cards.map(card => ({ value: `card:${card.cardId}`, name: card.name,
      source: { type: 'card' as const, cardId: card.cardId } })),
  ];
  function handleAdd() {
    dispatch({ type: 'effect/add', effect: { cardId: available[0].cardId,
      oncePerTurn: true, firstOnly: false, drawLock: 'none',
      steps: [{ kind: 'draw', count: MIN_DRAW_COUNT }] } });
    setSelectedId(null);
  }
  function moveEffect(index: number, offset: number) {
    const effectIds = deck.effects.map(effect => effect.id);
    [effectIds[index], effectIds[index + offset]] = [effectIds[index + offset], effectIds[index]];
    dispatch({ type: 'effect/reorder', effectIds });
    setSelectedId(selected?.id ?? null);
  }
  return <div className="EffectsView">
    {deck.effects.length === 0 && <EmptyState>
      カードのドロー効果を手順で設定すると、計算に反映されます。
    </EmptyState>}
    {cards.length === 0 && <p>メインデッキにカードを追加してください。</p>}
    <Button disabled={available.length === 0 || deck.effects.length >= MAX_DRAW_EFFECTS}
      onClick={handleAdd}>効果を追加</Button>
    <ul className="EffectsView-list" aria-label="ドロー効果一覧">
      {deck.effects.map((effect, index) => <EffectListRow key={effect.id} deck={deck}
        effect={effect} index={index} isSelected={effect.id === selected?.id}
        onSelect={setSelectedId} onMove={moveEffect} />)}
    </ul>
    {selected && <EffectEditor key={selected.id} deck={deck} effect={selected}
      cards={cards} sources={sources} />}
  </div>;
}
