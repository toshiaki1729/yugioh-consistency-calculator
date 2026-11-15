import { useState } from 'react';
import { useResolveCard } from '../../carddb/useCardDb';
import { MAX_SLOTS, MAX_TITLE_LENGTH, MIN_SLOT_COUNT } from '../../domain/limits';
import type { Deck, Pattern } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { TextField } from '../common/TextField';
import { PatternConditions } from './PatternConditions';
import { SlotRow } from './SlotRow';
import type { SlotOption } from './SlotRow';

/** 選択中パターンの名前・スロット・追加の条件を編集する。 */
export function PatternEditor({ deck, pattern }: { deck: Deck; pattern: Pattern }) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const [name, setName] = useState(pattern.name);
  const cards = deck.entries.filter(entry => entry.section === 'main').map(entry => {
    const card = resolveCard(entry.cardId);
    return { ...entry, card, name: card?.name ?? entry.name };
  }).sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  const sources: SlotOption[] = [
    ...deck.groups.map(group => ({ value: `group:${group.id}`, name: group.name,
      source: { type: 'group' as const, groupId: group.id } })),
    ...cards.map(card => ({ value: `card:${card.cardId}`, name: card.name,
      source: { type: 'card' as const, cardId: card.cardId } })),
  ];
  const canAddSlot = pattern.slots.length < MAX_SLOTS && sources.length > 0;
  function handleNameBlur() {
    if (!name.trim()) {
      setName(pattern.name);
      return;
    }
    if (name !== pattern.name) {
      dispatch({ type: 'pattern/edit', patternId: pattern.id, changes: { name } });
    }
  }
  function handleAddSlot() {
    dispatch({ type: 'slot/add', patternId: pattern.id,
      slot: { source: sources[0].source, count: MIN_SLOT_COUNT, distinctNames: false } });
  }
  return <section className="PatternsView-editor" aria-label="パターンの編集">
    <TextField label="パターン名" value={name} required maxLength={MAX_TITLE_LENGTH}
      aria-invalid={!name.trim()} onChange={event => setName(event.target.value)}
      onBlur={handleNameBlur} />
    {deck.groups.length === 0 && <p className="PatternsView-note">
      条件でカードをまとめるには、カードグループを先に作成してください。特定のカードはそのまま指定できます。
    </p>}
    {pattern.slots.map((slot, index) =>
      <SlotRow key={slot.id} deck={deck} patternId={pattern.id} slot={slot} index={index}
        cards={cards} sources={sources} />)}
    {pattern.slots.length > 0 && <p id="distinct-description" className="PatternsView-note">
      種類違い: 別々のカード（カードDB上の別カード）を必要枚数そろえる
    </p>}
    {sources.length === 0 &&
      <p className="PatternsView-note">メインデッキにカードを追加して、スロットの対象を選んでください。</p>}
    <Button disabled={!canAddSlot} onClick={handleAddSlot}>スロットを追加</Button>
    <PatternConditions pattern={pattern} sources={sources} />
  </section>;
}
