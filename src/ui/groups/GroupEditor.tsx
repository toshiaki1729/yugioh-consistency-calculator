import { useState } from 'react';
import type { CardGroup, Deck, FilterNode } from '../../domain/types';
import { MAX_GROUPS, MAX_TITLE_LENGTH } from '../../domain/limits';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { FilterBuilder } from './FilterBuilder';
import type { FilterBuilderProps } from './FilterBuilder';
import { GroupCardRow } from './GroupCardRow';
import type { GroupRow } from './useGroupRows';

interface GroupEditorProps {
  deck: Deck;
  group: CardGroup;
  rows: GroupRow[];
  available: GroupRow[];
  unknownOverrides: GroupRow[];
  deckCards: FilterBuilderProps['deckCards'];
  onDuplicate: () => void;
  onDelete: () => void;
}

function AvailableCardOption({ entry, card }: GroupRow) {
  return <option value={entry.cardId}>
    {card?.name ?? entry.name}（{entry.count} 枚{card ? '' : '・未取得'}）
  </option>;
}

function ManualGroupCards({ group, available, unknownOverrides }: Pick<
  GroupEditorProps, 'group' | 'available' | 'unknownOverrides'
>) {
  const dispatch = useDispatch();
  const [cardId, setCardId] = useState('');
  const selectedCardId = available.some(({ entry }) => entry.cardId === cardId) ? cardId : '';
  function handleAdd() {
    dispatch({ type: 'group/edit', groupId: group.id,
      changes: { include: [...group.include, selectedCardId] } });
    setCardId('');
  }
  return <section className="GroupsView-manual" aria-labelledby="group-manual-heading">
    <h2 id="group-manual-heading">手動追加</h2>
    {available.length ? <>
      <Select label="追加するカード" value={selectedCardId}
        onChange={event => setCardId(event.target.value)}>
        <option value="">カードを選択</option>
        {available.map(row => <AvailableCardOption key={row.entry.cardId} {...row} />)}
      </Select>
      <Button disabled={!selectedCardId} onClick={handleAdd}>手動で追加</Button>
    </> : <p className="GroupsView-note">手動追加できる条件外のカードはありません。</p>}
    {unknownOverrides.length > 0 &&
      <ul className="GroupsView-cards" aria-label="未取得カードの手動設定">
        {unknownOverrides.map(row =>
          <GroupCardRow key={row.entry.cardId} {...row} group={group} />)}
      </ul>}
  </section>;
}

/** 選択中グループの名前・条件・手動の追加と除外を編集する。 */
export function GroupEditor({ deck, group, rows, available, unknownOverrides,
  deckCards, onDuplicate, onDelete }: GroupEditorProps) {
  const dispatch = useDispatch();
  const [name, setName] = useState(group.name);
  function handleFilter(filter: FilterNode) {
    dispatch({ type: 'group/edit', groupId: group.id, changes: { filter } });
  }
  function handleNameBlur() {
    if (!name.trim()) {
      setName(group.name);
      return;
    }
    if (name !== group.name) {
      dispatch({ type: 'group/edit', groupId: group.id, changes: { name } });
    }
  }
  return <section className="GroupsView-editor" aria-label="グループの編集">
    <TextField label="グループ名" value={name} required maxLength={MAX_TITLE_LENGTH}
      aria-invalid={name.trim().length === 0} onChange={event => setName(event.target.value)}
      onBlur={handleNameBlur} />
    <div className="GroupsView-actions">
      <Button disabled={deck.groups.length >= MAX_GROUPS} onClick={onDuplicate}>複製</Button>
      <Button variant="danger" onClick={onDelete}>削除</Button>
    </div>
    <FilterBuilder key={group.id} value={group.filter} deckCards={deckCards}
      onChange={handleFilter} />
    <section aria-labelledby="group-matches-heading">
      <h2 id="group-matches-heading">該当カード</h2>
      {rows.length ? <ul className="GroupsView-cards">
        {rows.map(row => <GroupCardRow key={row.entry.cardId} {...row} group={group} />)}
      </ul> : <p className="GroupsView-note">該当するカードがありません。</p>}
    </section>
    <ManualGroupCards group={group} available={available} unknownOverrides={unknownOverrides} />
  </section>;
}
