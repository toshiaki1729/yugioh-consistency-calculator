import type { ChangeEvent } from 'react';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Select } from '../common/Select';
import { ConditionRow } from './ConditionRow';
import { defaultPredicate, rowError } from './filterForm';
import type { FilterForm, FilterGroup, FilterRow } from './filterForm';
import type { FilterBuilderProps } from './FilterBuilder';

/** 条件全体またはまとまりの AND・OR を選ぶ。 */
export function OperatorSelect({ value, onChange, label }: {
  value: 'and' | 'or'; onChange: (value: 'and' | 'or') => void; label: string;
}) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(event.target.value as 'and' | 'or');
  }
  return <Select label={label} value={value} onChange={handleChange}>
    <option value="and">すべて満たす（AND）</option><option value="or">いずれかを満たす（OR）</option>
  </Select>;
}

interface FilterGroupRowProps {
  row: FilterGroup;
  index: number;
  deckCards: FilterBuilderProps['deckCards'];
  onChange: (row: FilterGroup, shouldDebounce?: boolean) => void;
  onRemove: () => void;
}

function GroupConditionRow({ row, index, groupIndex, group, onChange, deckCards }: {
  row: FilterRow; index: number; groupIndex: number; group: FilterGroup;
} & Pick<FilterGroupRowProps, 'onChange' | 'deckCards'>) {
  function handleChange(next: FilterRow, shouldDebounce?: boolean) {
    const rows = group.rows.map((item, i) => i === index ? next : item);
    onChange({ ...group, rows }, shouldDebounce);
  }
  function handleRemove() {
    onChange({ ...group, rows: group.rows.filter((_, i) => i !== index) });
  }
  return <ConditionRow row={row} label={`条件 ${groupIndex + 1}.${index + 1}`}
    deckCards={deckCards} isNegationDisabled={group.negated}
    onChange={handleChange} onRemove={handleRemove} />;
}

function FilterGroupRow({ row, index, deckCards, onChange, onRemove }: FilterGroupRowProps) {
  const hasValidRows = row.rows.some(child => !rowError(child.pred));
  function handleAdd() {
    const child: FilterRow = {
      type: 'row', pred: defaultPredicate('nameContains'), negated: false,
    };
    onChange({ ...row, rows: [...row.rows, child] });
  }
  function handleNegation(event: ChangeEvent<HTMLInputElement>) {
    const isNegated = event.target.checked;
    const rows = isNegated ? row.rows.map(child => ({ ...child, negated: false })) : row.rows;
    onChange({ ...row, negated: isNegated, rows });
  }
  return <fieldset className="FilterBuilder-group">
    <legend>条件のまとまり {index + 1}</legend>
    <OperatorSelect label="まとまりの一致" value={row.op}
      onChange={op => onChange({ ...row, op })} />
    {row.rows.map((child, childIndex) =>
      <GroupConditionRow key={childIndex} row={child} index={childIndex} groupIndex={index}
        group={row} onChange={onChange} deckCards={deckCards} />)}
    {!hasValidRows &&
      <p className="FilterBuilder-note" role="status">条件がないため無視しています</p>}
    <div className="FilterBuilder-actions">
      <Button onClick={handleAdd}>条件を追加</Button>
      <Checkbox label="まとまりを否定" checked={row.negated} onChange={handleNegation} />
      <Button onClick={onRemove}>まとまりを削除</Button>
    </div>
  </fieldset>;
}

/** 最上位の条件行または条件のまとまりを編集する。 */
export function FilterFormRow({ row, index, form, onChange, deckCards }: {
  row: FilterForm['rows'][number]; index: number; form: FilterForm;
  onChange: (form: FilterForm, shouldDebounce?: boolean) => void;
  deckCards: FilterBuilderProps['deckCards'];
}) {
  function handleChange(next: FilterForm['rows'][number], shouldDebounce?: boolean) {
    const rows = form.rows.map((item, i) => i === index ? next : item);
    onChange({ ...form, rows }, shouldDebounce);
  }
  function handleRemove() {
    onChange({ ...form, rows: form.rows.filter((_, i) => i !== index) });
  }
  if (row.type === 'row') {
    return <ConditionRow row={row} label={`条件 ${index + 1}`} deckCards={deckCards}
      onChange={handleChange} onRemove={handleRemove} />;
  }
  return <FilterGroupRow row={row} index={index} deckCards={deckCards}
    onChange={handleChange} onRemove={handleRemove} />;
}
