import type { ChangeEvent } from 'react';
import type { CardGroup } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { CardSummary } from '../deck/CardSummary';
import type { GroupRow } from './useGroupRows';

/** グループ内のカードと手動追加・除外の操作を表示する。 */
export function GroupCardRow({ entry, card, group }: GroupRow & { group: CardGroup }) {
  const dispatch = useDispatch();
  const isIncluded = group.include.includes(entry.cardId);
  const isExcluded = group.exclude.includes(entry.cardId);
  const className = `GroupsView-cardRow${isExcluded ? ' GroupsView-excluded' : ''}`;
  function handleExclude(event: ChangeEvent<HTMLInputElement>) {
    const exclude = event.target.checked
      ? [...group.exclude, entry.cardId] : group.exclude.filter(id => id !== entry.cardId);
    dispatch({ type: 'group/edit', groupId: group.id, changes: { exclude } });
  }
  function handleCancelInclude() {
    const include = group.include.filter(id => id !== entry.cardId);
    dispatch({ type: 'group/edit', groupId: group.id, changes: { include } });
  }
  return <li className={className} aria-label={card?.name ?? entry.name}>
    <div className="GroupsView-cardName"><CardSummary card={card} name={entry.name} /></div>
    <span>{entry.count} 枚</span>
    <div className="GroupsView-actions">
      {isIncluded && <span className="GroupsView-note">手動で追加</span>}
      {isExcluded && <span className="GroupsView-note">手動で除外</span>}
      <Checkbox label="除外" checked={isExcluded} onChange={handleExclude} />
      {isIncluded && <Button onClick={handleCancelInclude}>手動追加を取り消す</Button>}
    </div>
  </li>;
}
