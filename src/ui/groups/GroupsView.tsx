import { useState } from 'react';
import type { CardGroup, Deck } from '../../domain/types';
import { MAX_GROUPS } from '../../domain/limits';
import { useResolveCard } from '../../carddb/useCardDb';
import { hasEffectTarget, isSameTarget } from '../../state/reducer/targetReferences';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';
import { EmptyState } from '../common/EmptyState';
import { GroupEditor } from './GroupEditor';
import { useGroupRows } from './useGroupRows';
import './GroupsView.css';

function GroupListRow({ group, kinds, count, isSelected, onSelect }: {
  group: CardGroup; kinds: number; count: number; isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return <li>
    <button type="button" className="GroupsView-choice" aria-pressed={isSelected}
      onClick={() => onSelect(group.id)}>
      <span>{group.name}</span><span className="GroupsView-note">{kinds} 種 / {count} 枚</span>
    </button>
  </li>;
}

function DeleteGroupDialog({ group, deck, onClose, onDelete }: {
  group: CardGroup; deck: Deck; onClose: () => void; onDelete: () => void;
}) {
  const resolveCard = useResolveCard();
  const target = { type: 'group', groupId: group.id } as const;
  const conditionReferences = deck.patterns.filter(pattern =>
    pattern.conditions.some(condition => isSameTarget(condition.target, target)));
  const references = deck.patterns.filter(pattern => conditionReferences.includes(pattern)
    || pattern.slots.some(slot => isSameTarget(slot.source, target)));
  const effects = deck.effects.filter(effect => hasEffectTarget(effect, target));
  const effectNames = effects.map(effect => ({
    id: effect.id,
    name: resolveCard(effect.cardId)?.name ?? deck.entries.find(entry =>
      entry.section === 'main' && entry.cardId === effect.cardId)?.name ?? effect.cardId,
  }));
  const referenceNotice = conditionReferences.length > 0
    ? 'これらのパターンから該当するスロットや追加の条件も削除されます。'
    : 'これらのパターンから該当するスロットも削除されます。';
  return <Dialog open title="グループを削除" onClose={onClose}>
    <p>「{group.name}」を削除しますか？</p>
    {references.length > 0 && <>
      <ul>{references.map(pattern => <li key={pattern.id}>{pattern.name}</li>)}</ul>
      <p>{referenceNotice}</p>
    </>}
    {effectNames.length > 0 && <>
      <ul>{effectNames.map(effect => <li key={effect.id}>{effect.name}</li>)}</ul>
      <p>これらのドロー効果も削除されます。</p>
    </>}
    <div className="GroupsView-actions">
      <Button onClick={onClose}>キャンセル</Button>
      <Button variant="danger" onClick={onDelete}>削除する</Button>
    </div>
  </Dialog>;
}

/** グループの選択・作成・複製・削除と選択中の編集画面を表示する。 */
export function GroupsView({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const [selectedId, setSelectedId] = useState<string | null>(deck.groups[0]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { groups, deckCards, unknownCount, unknownCopies } = useGroupRows(deck);
  const selected = groups.find(item => item.group.id === selectedId) ?? groups.at(-1);
  const deleting = deck.groups.find(group => group.id === deletingId);
  function createGroup() {
    let number = 1;
    while (deck.groups.some(group => group.name === `グループ ${number}`)) number++;
    dispatch({ type: 'group/create', name: `グループ ${number}` });
    setSelectedId(null);
  }
  function handleDuplicate() {
    if (!selected) return;
    dispatch({ type: 'group/duplicate', groupId: selected.group.id });
    setSelectedId(null);
  }
  function handleDelete() {
    if (!deleting) return;
    dispatch({ type: 'group/delete', groupId: deleting.id });
    setDeletingId(null);
  }
  return <div className="GroupsView">
    {groups.length === 0 ? <EmptyState>
      <p>カードグループを作ると、条件に合うカードをまとめて初動パターンに使えます。</p>
      <Button variant="primary" onClick={createGroup}>グループを作成</Button>
    </EmptyState> : <>
      <section className="GroupsView-sidebar" aria-label="グループ一覧">
        <Button onClick={createGroup} disabled={groups.length >= MAX_GROUPS}>グループを作成</Button>
        <ul className="GroupsView-list">{groups.map(item =>
          <GroupListRow key={item.group.id} {...item}
            isSelected={selected?.group.id === item.group.id} onSelect={setSelectedId} />)}</ul>
      </section>
      <div className="GroupsView-detail">
        {unknownCount > 0 && <p className="GroupsView-note">
          未取得カードは条件で判定できません。必要なら手動で追加してください（{unknownCount} 種 / {unknownCopies} 枚）。
        </p>}
        {selected && <GroupEditor key={selected.group.id} deck={deck} {...selected}
          deckCards={deckCards} onDuplicate={handleDuplicate}
          onDelete={() => setDeletingId(selected.group.id)} />}
      </div>
    </>}
    {deleting && <DeleteGroupDialog group={deleting} deck={deck}
      onClose={() => setDeletingId(null)} onDelete={handleDelete} />}
  </div>;
}
