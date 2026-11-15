import type { ChangeEvent } from 'react';
import { isInGroup } from '../../domain/filter';
import { MAX_SLOT_COUNT, MIN_SLOT_COUNT } from '../../domain/limits';
import type { CardData, Deck, Slot, SlotSource } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Select } from '../common/Select';

/** スロットの選択肢と対応する保存用の対象。 */
export interface SlotOption { value: string; name: string; source: SlotSource }

interface SlotRowProps {
  deck: Deck;
  patternId: string;
  slot: Slot;
  index: number;
  cards: { cardId: string; card?: CardData }[];
  sources: SlotOption[];
}

const slotCounts = Array.from({ length: MAX_SLOT_COUNT - MIN_SLOT_COUNT + 1 },
  (_, index) => index + MIN_SLOT_COUNT);

/** スロットと追加の条件に共通の対象を選ぶ。 */
export function SlotSourceSelect({ source, sources, onChange }: {
  source: SlotSource; sources: SlotOption[]; onChange: (source: SlotSource) => void;
}) {
  const value = source.type === 'group' ? `group:${source.groupId}` : `card:${source.cardId}`;
  const hasSource = sources.some(item => item.value === value);
  const groupOptions = sources.filter(item => item.source.type === 'group');
  const cardOptions = sources.filter(item => item.source.type === 'card');
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const selected = sources.find(item => item.value === event.target.value)!;
    onChange(selected.source);
  }
  return <Select label="対象" value={value} onChange={handleChange}>
    {!hasSource && <option value={value} disabled>メインデッキにないカード</option>}
    <optgroup label="グループ">{groupOptions.map(item =>
      <option key={item.value} value={item.value}>グループ: {item.name}</option>)}</optgroup>
    <optgroup label="カード">{cardOptions.map(item =>
      <option key={item.value} value={item.value}>カード: {item.name}</option>)}</optgroup>
  </Select>;
}

/** スロットの対象・枚数・種類違いと削除を編集する。 */
export function SlotRow({ deck, patternId, slot, index, cards, sources }: SlotRowProps) {
  const dispatch = useDispatch();
  const source = slot.source;
  const group = source.type === 'group'
    ? deck.groups.find(item => item.id === source.groupId) : undefined;
  const isEmptyGroup = group && !cards.some(card => isInGroup(group, card.cardId, card.card));
  function editSlot(changes: Partial<Omit<Slot, 'id'>>) {
    dispatch({ type: 'slot/edit', patternId, slotId: slot.id, changes });
  }
  function handleCount(event: ChangeEvent<HTMLSelectElement>) {
    const count = Number(event.target.value);
    editSlot({ count, distinctNames: count === MIN_SLOT_COUNT ? false : slot.distinctNames });
  }
  function handleDelete() {
    dispatch({ type: 'slot/delete', patternId, slotId: slot.id });
  }
  return <fieldset className="PatternsView-slot">
    <legend>スロット {index + 1}</legend>
    <SlotSourceSelect source={source} sources={sources}
      onChange={next => editSlot({ source: next })} />
    <div className="PatternsView-actions">
      <Select label="必要枚数" value={slot.count} onChange={handleCount}>
        {slotCounts.map(count => <option key={count} value={count}>{count}</option>)}
      </Select>
      <Checkbox label="種類違い" checked={slot.distinctNames} disabled={slot.count <= MIN_SLOT_COUNT}
        aria-describedby="distinct-description"
        onChange={event => editSlot({ distinctNames: event.target.checked })} />
      <Button variant="danger" onClick={handleDelete}>スロットを削除</Button>
    </div>
    {isEmptyGroup && <p className="PatternsView-warning">
      このグループに該当するカードがメインデッキにありません
    </p>}
  </fieldset>;
}
