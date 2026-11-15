import type { CardData, CardId, FilterNode } from '../../domain/types';
import { Button } from '../common/Button';
import { defaultPredicate } from './filterForm';
import { FilterFormRow, OperatorSelect } from './FilterFormRows';
import { useFilterForm } from './useFilterForm';
import './FilterBuilder.css';

/** 編集する条件式とメインデッキのカード候補。 */
export interface FilterBuilderProps {
  value: FilterNode;
  onChange: (node: FilterNode) => void;
  deckCards: { id: CardId; name: string; card?: CardData }[];
}

/** 単独条件と一段のまとまりでカードの条件式を編集する。 */
export function FilterBuilder({ value, onChange, deckCards }: FilterBuilderProps) {
  const { parsed, updateForm } = useFilterForm(value, onChange);
  if (!parsed.ok) return <p role="status">この条件は画面では編集できません</p>;
  const form = parsed.value;
  const cards = [...deckCards].sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  function handleAddCondition() {
    updateForm({ ...form, rows: [...form.rows, {
      type: 'row', pred: defaultPredicate('nameContains'), negated: false,
    }] });
  }
  function handleAddGroup() {
    updateForm({ ...form, rows: [...form.rows, {
      type: 'group', op: 'and', rows: [], negated: false,
    }] });
  }
  return <div className="FilterBuilder">
    <OperatorSelect label="条件全体の一致" value={form.op}
      onChange={op => updateForm({ ...form, op })} />
    {form.rows.map((row, index) =>
      <FilterFormRow key={index} row={row} index={index} form={form}
        onChange={updateForm} deckCards={cards} />)}
    <div className="FilterBuilder-actions">
      <Button onClick={handleAddCondition}>条件を追加</Button>
      <Button onClick={handleAddGroup}>条件のまとまりを追加</Button>
    </div>
  </div>;
}
