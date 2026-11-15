import { useState } from 'react';
import type { Deck } from '../../domain/types';
import { MAX_PATTERNS } from '../../domain/limits';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';
import { EmptyState } from '../common/EmptyState';
import { useCalculation } from './CalculationProvider';
import { FIRST_HAND_SIZE } from './calculationConstants';
import { PatternEditor } from './PatternEditor';
import { PatternListRow } from './PatternListRow';
import './PatternsView.css';

/** 初動パターンの一覧と編集・作成・複製・削除を表示する。 */
export function PatternsView({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const calculation = useCalculation();
  const first = calculation.results?.find(result => result.handSize === FIRST_HAND_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(deck.patterns[0]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selected = deck.patterns.find(pattern => pattern.id === selectedId) ?? deck.patterns.at(-1);
  const deleting = deck.patterns.find(pattern => pattern.id === deletingId);
  function movePattern(index: number, offset: number) {
    const ids = deck.patterns.map(pattern => pattern.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    dispatch({ type: 'pattern/reorder', patternIds: ids });
  }
  function handleCreate() {
    let number = 1;
    while (deck.patterns.some(pattern => pattern.name === `パターン ${number}`)) number++;
    dispatch({ type: 'pattern/create', name: `パターン ${number}` });
    setSelectedId(null);
  }
  function handleDuplicate(patternId: string) {
    dispatch({ type: 'pattern/duplicate', patternId });
    setSelectedId(null);
  }
  function handleDelete() {
    if (!deleting) return;
    dispatch({ type: 'pattern/delete', patternId: deleting.id });
    setDeletingId(null);
  }
  return <div className="PatternsView">
    {deck.patterns.length === 0 && <EmptyState>
      初動とみなすカードの組み合わせをパターンとして作成します。「カードグループ」タブで作成したグループか、特定のカードをスロットの対象に指定できます。
    </EmptyState>}
    <Button disabled={deck.patterns.length >= MAX_PATTERNS} onClick={handleCreate}>パターンを作成</Button>
    {calculation.stale && <p className="PatternsView-warning">古い結果（再計算してください）</p>}
    <ul className="PatternsView-list" aria-label="パターン一覧">{deck.patterns.map((pattern, index) =>
      <PatternListRow key={pattern.id} deck={deck} pattern={pattern} index={index}
        isSelected={selected?.id === pattern.id} estimate={first?.perPattern[pattern.id]}
        onSelect={setSelectedId} onMove={movePattern}
        onDuplicate={handleDuplicate} onDelete={setDeletingId} />)}</ul>
    {selected && <PatternEditor key={selected.id} deck={deck} pattern={selected} />}
    {deleting && <Dialog open title="パターンを削除" onClose={() => setDeletingId(null)}>
      <p>「{deleting.name}」を削除しますか？</p>
      <div className="PatternsView-actions">
        <Button onClick={() => setDeletingId(null)}>キャンセル</Button>
        <Button variant="danger" onClick={handleDelete}>削除する</Button>
      </div>
    </Dialog>}
  </div>;
}
