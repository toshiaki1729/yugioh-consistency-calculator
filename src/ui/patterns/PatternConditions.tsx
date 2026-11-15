import { MAX_PATTERN_CONDITIONS } from '../../domain/limits';
import type { Pattern } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { ConditionEditorRow, createDefaultCondition } from './ConditionEditorRow';
import type { SlotOption } from './SlotRow';

/** パターンの追加の条件を一覧表示し、上限内で追加する。 */
export function PatternConditions({ pattern, sources }: {
  pattern: Pattern; sources: SlotOption[];
}) {
  const dispatch = useDispatch();
  const canAdd = pattern.conditions.length < MAX_PATTERN_CONDITIONS && sources.length > 0;
  function handleAdd() {
    dispatch({ type: 'condition/add', patternId: pattern.id,
      condition: createDefaultCondition('deckAtLeast', sources[0].source) });
  }
  // 条件には ID がないため、増減時は入力途中の値を別の行に引き継がない。
  const rowKeyPrefix = pattern.conditions.length;
  return <section className="PatternsView-conditions" aria-label="追加の条件">
    <h2>追加の条件</h2>
    {pattern.conditions.map((condition, index) =>
      <ConditionEditorRow key={`${rowKeyPrefix}:${index}`} patternId={pattern.id}
        condition={condition} index={index} sources={sources} />)}
    {sources.length === 0 && <p className="PatternsView-note">
      条件の対象にするカードをメインデッキに追加するか、カードグループを作成してください。
    </p>}
    <Button disabled={!canAdd} onClick={handleAdd}>条件を追加</Button>
  </section>;
}
