import type { ReactNode } from 'react';
import { useResolveCard } from '../../carddb/useCardDb';
import { MAX_PATTERNS } from '../../domain/limits';
import type { Deck, Pattern } from '../../domain/types';
import type { Estimate } from '../../engine/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { IconButton } from '../common/IconButton';
import { EstimateValue } from './EstimateValue';

interface PatternListRowProps {
  deck: Deck;
  pattern: Pattern;
  index: number;
  isSelected: boolean;
  estimate?: Estimate;
  onSelect: (id: string) => void;
  onMove: (index: number, offset: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

/** パターンの要約・成立確率と一覧の操作を表示する。 */
export function PatternListRow({ deck, pattern, index, isSelected, estimate,
  onSelect, onMove, onDuplicate, onDelete }: PatternListRowProps) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const summary = pattern.slots.map(slot => {
    const source = slot.source;
    let name;
    if (source.type === 'group') {
      name = deck.groups.find(group => group.id === source.groupId)?.name;
    } else {
      name = resolveCard(source.cardId)?.name
        ?? deck.entries.find(entry => entry.cardId === source.cardId)?.name ?? '未取得カード';
    }
    return `${name} ×${slot.count}${slot.distinctNames ? '（種類違い）' : ''}`;
  }).join(' + ') || 'スロットがありません';
  let probability: ReactNode = '未計算';
  if (!pattern.enabled) probability = '無効';
  else if (estimate) probability = <EstimateValue estimate={estimate} />;
  return <li aria-label={pattern.name} className="PatternsView-row">
    <Checkbox label="有効" aria-label={`${pattern.name}を有効にする`} checked={pattern.enabled}
      onChange={() => dispatch({ type: 'pattern/toggle', patternId: pattern.id })} />
    <button type="button" className="PatternsView-choice" aria-pressed={isSelected}
      onClick={() => onSelect(pattern.id)}>
      <span>{pattern.name}</span><span className="PatternsView-note">{summary}</span>
    </button>
    <span>{probability}</span>
    <div className="PatternsView-actions">
      <IconButton aria-label={`${pattern.name}を上へ`} disabled={index === 0}
        onClick={() => onMove(index, -1)}>↑</IconButton>
      <IconButton aria-label={`${pattern.name}を下へ`} disabled={index === deck.patterns.length - 1}
        onClick={() => onMove(index, 1)}>↓</IconButton>
      <Button disabled={deck.patterns.length >= MAX_PATTERNS}
        onClick={() => onDuplicate(pattern.id)}>複製</Button>
      <Button variant="danger" onClick={() => onDelete(pattern.id)}>削除</Button>
    </div>
  </li>;
}
