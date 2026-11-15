import { useMemo, useState } from 'react';
import { useCardDb, useResolveCard } from '../../carddb/useCardDb';
import { evaluateFilter, isInGroup } from '../../domain/filter';
import type { CardData, CardGroup, Deck, DeckEntry } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Dialog } from '../common/Dialog';
import { EmptyState } from '../common/EmptyState';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { CardSummary } from '../deck/CardSummary';
import { FilterBuilder } from './FilterBuilder';
import './GroupsView.css';

interface GroupRow { entry: DeckEntry; card?: CardData }

function GroupCardRow({ entry, card, group }: GroupRow & { group: CardGroup }) {
  const dispatch = useDispatch();
  const included = group.include.includes(entry.cardId);
  const excluded = group.exclude.includes(entry.cardId);
  return <li className={`GroupsView-cardRow${excluded ? ' GroupsView-excluded' : ''}`} aria-label={card?.name ?? entry.name}>
    <div className="GroupsView-cardName"><CardSummary card={card} name={entry.name} /></div>
    <span>{entry.count} 枚</span>
    <div className="GroupsView-actions">
      {included && <span className="GroupsView-note">手動で追加</span>}
      {excluded && <span className="GroupsView-note">手動で除外</span>}
      <Checkbox label="除外" checked={excluded} onChange={event => dispatch({ type: 'group/edit', groupId: group.id,
        changes: { exclude: event.target.checked ? [...group.exclude, entry.cardId] : group.exclude.filter(id => id !== entry.cardId) } })} />
      {included && <Button onClick={() => dispatch({ type: 'group/edit', groupId: group.id,
        changes: { include: group.include.filter(id => id !== entry.cardId) } })}>手動追加を取り消す</Button>}
    </div>
  </li>;
}

function GroupEditor({ deck, group, rows, available, unknownOverrides, deckCards, onDuplicate, onDelete }: {
  deck: Deck; group: CardGroup; rows: GroupRow[]; available: GroupRow[]; unknownOverrides: GroupRow[];
  deckCards: { id: string; name: string; card?: CardData }[]; onDuplicate: () => void; onDelete: () => void;
}) {
  const dispatch = useDispatch();
  const [name, setName] = useState(group.name);
  const [cardId, setCardId] = useState('');
  const selectedCardId = available.some(({ entry }) => entry.cardId === cardId) ? cardId : '';
  return <section className="GroupsView-editor" aria-label="グループの編集">
    <TextField label="グループ名" value={name} required maxLength={50} aria-invalid={name.trim().length === 0}
      onChange={event => setName(event.target.value)} onBlur={() => {
        if (!name.trim()) { setName(group.name); return; }
        if (name !== group.name) dispatch({ type: 'group/edit', groupId: group.id, changes: { name } });
      }} />
    <div className="GroupsView-actions">
      <Button disabled={deck.groups.length >= 200} onClick={onDuplicate}>複製</Button>
      <Button variant="danger" onClick={onDelete}>削除</Button>
    </div>
    <FilterBuilder key={group.id} value={group.filter} deckCards={deckCards}
      onChange={filter => dispatch({ type: 'group/edit', groupId: group.id, changes: { filter } })} />
    <section aria-labelledby="group-matches-heading">
      <h2 id="group-matches-heading">該当カード</h2>
      {rows.length ? <ul className="GroupsView-cards">{rows.map(row => <GroupCardRow key={row.entry.cardId} {...row} group={group} />)}</ul>
        : <p className="GroupsView-note">該当するカードがありません。</p>}
    </section>
    <section className="GroupsView-manual" aria-labelledby="group-manual-heading">
      <h2 id="group-manual-heading">手動追加</h2>
      {available.length ? <>
        <Select label="追加するカード" value={selectedCardId} onChange={event => setCardId(event.target.value)}>
          <option value="">カードを選択</option>
          {available.map(({ entry, card }) => <option key={entry.cardId} value={entry.cardId}>
            {card?.name ?? entry.name}（{entry.count} 枚{card ? '' : '・未取得'}）
          </option>)}
        </Select>
        <Button disabled={!selectedCardId} onClick={() => {
          dispatch({ type: 'group/edit', groupId: group.id, changes: { include: [...group.include, selectedCardId] } });
          setCardId('');
        }}>手動で追加</Button>
      </> : <p className="GroupsView-note">手動追加できる条件外のカードはありません。</p>}
      {unknownOverrides.length > 0 && <ul className="GroupsView-cards" aria-label="未取得カードの手動設定">
        {unknownOverrides.map(row => <GroupCardRow key={row.entry.cardId} {...row} group={group} />)}
      </ul>}
    </section>
  </section>;
}

export function GroupsView({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const dbState = useCardDb();
  const db = dbState.status === 'ready' ? dbState.db : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(deck.groups[0]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { groups, deckCards, unknownCount, unknownCopies } = useMemo(() => {
    const kindOrder = { monster: 0, spell: 1, trap: 2 };
    const main = deck.entries.filter(entry => entry.section === 'main')
      .map(entry => ({ entry, card: resolveCard(entry.cardId) }))
      .sort((a, b) => (a.card ? kindOrder[a.card.kind] : 3) - (b.card ? kindOrder[b.card.kind] : 3)
        || (a.card?.name ?? a.entry.name).localeCompare(b.card?.name ?? b.entry.name, 'ja'));
    const unknown = main.filter(row => !row.card);
    return {
      deckCards: main.map(({ entry, card }) => ({ id: entry.cardId, name: card?.name ?? entry.name, card })),
      unknownCount: unknown.length, unknownCopies: unknown.reduce((sum, row) => sum + row.entry.count, 0),
      groups: deck.groups.map(group => {
        const members = main.filter(({ entry, card }) => isInGroup(group, entry.cardId, card));
        const evaluated = main.map(row => ({ ...row, matches: row.card ? evaluateFilter(group.filter, row.card) : false,
          included: group.include.includes(row.entry.cardId), excluded: group.exclude.includes(row.entry.cardId) }));
        return { group, kinds: members.length, count: members.reduce((sum, row) => sum + row.entry.count, 0),
          rows: evaluated.filter(row => row.card && (row.matches || row.included || row.excluded)),
          available: evaluated.filter(row => !row.matches && !row.included && !row.excluded),
          unknownOverrides: evaluated.filter(row => !row.card && (row.included || row.excluded)) };
      }),
    };
    // resolveCard は毎描画で新しい関数になるため、参照するデッキと DB の変更で再計算する。
  }, [deck, dbState.status, db]);
  const selected = groups.find(item => item.group.id === selectedId) ?? groups.at(-1);
  const deleting = deck.groups.find(group => group.id === deletingId);
  const references = deleting ? deck.patterns.filter(pattern => pattern.slots.some(slot =>
    slot.source.type === 'group' && slot.source.groupId === deleting.id)) : [];

  function createGroup() {
    let number = 1;
    while (deck.groups.some(group => group.name === `グループ ${number}`)) number++;
    dispatch({ type: 'group/create', name: `グループ ${number}` });
    setSelectedId(null);
  }

  return <div className="GroupsView">
    {groups.length === 0 ? <EmptyState>
      <p>カードグループを作ると、条件に合うカードをまとめて初動パターンに使えます</p>
      <Button variant="primary" onClick={createGroup}>グループを作成</Button>
    </EmptyState> : <>
      <section className="GroupsView-sidebar" aria-label="グループ一覧">
        <Button onClick={createGroup} disabled={groups.length >= 200}>グループを作成</Button>
        <ul className="GroupsView-list">{groups.map(({ group, kinds, count }) => <li key={group.id}>
          <button type="button" className="GroupsView-choice" aria-pressed={selected?.group.id === group.id}
            onClick={() => setSelectedId(group.id)}>
            <span>{group.name}</span><span className="GroupsView-note">{kinds} 種 / {count} 枚</span>
          </button>
        </li>)}</ul>
      </section>
      <div className="GroupsView-detail">
        {unknownCount > 0 && <p className="GroupsView-note">未取得カードは条件で判定できません。必要なら手動で追加してください（{unknownCount} 種 / {unknownCopies} 枚）。</p>}
        {selected && <GroupEditor key={selected.group.id} deck={deck} {...selected} deckCards={deckCards}
          onDuplicate={() => { dispatch({ type: 'group/duplicate', groupId: selected.group.id }); setSelectedId(null); }}
          onDelete={() => setDeletingId(selected.group.id)} />}
      </div>
    </>}
    {deleting && <Dialog open title="グループを削除" onClose={() => setDeletingId(null)}>
      <p>「{deleting.name}」を削除しますか？</p>
      {references.length > 0 && <>
        <ul>{references.map(pattern => <li key={pattern.id}>{pattern.name}</li>)}</ul>
        <p>これらのパターンから該当スロットも削除されます</p>
      </>}
      <div className="GroupsView-actions">
        <Button onClick={() => setDeletingId(null)}>キャンセル</Button>
        <Button variant="danger" onClick={() => { dispatch({ type: 'group/delete', groupId: deleting.id }); setDeletingId(null); }}>削除する</Button>
      </div>
    </Dialog>}
  </div>;
}
