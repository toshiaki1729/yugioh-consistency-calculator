import { useId } from 'react';
import type { ChangeEvent } from 'react';
import type { Predicate } from '../../domain/types';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Select } from '../common/Select';
import { defaultPredicate, rowError } from './filterForm';
import type { FilterRow } from './filterForm';
import type { FilterBuilderProps } from './FilterBuilder';
import { PredicateFields } from './PredicateFields';

const predicateLabels: Record<Predicate['kind'], string> = {
  nameContains: 'カード名キーワード', textContains: 'テキストキーワード', archetype: 'テーマ「X」カード',
  mentionsName: '「X」が記されたカード', cardKind: 'カードの種類', monsterType: 'モンスターの種類',
  attribute: '属性', race: '種族', level: 'レベル', rank: 'ランク', link: 'リンク', atk: '攻撃力',
  def: '守備力', scale: 'Pスケール', property: '魔法罠の種類', cards: '特定のカード',
};

/** 条件の種類・値・否定と入力エラーを一行分編集する。 */
export function ConditionRow({ row, onChange, onRemove, deckCards, label,
  isNegationDisabled = false }: {
  row: FilterRow;
  onChange: (row: FilterRow, shouldDebounce?: boolean) => void;
  onRemove: () => void;
  deckCards: FilterBuilderProps['deckCards'];
  label: string;
  isNegationDisabled?: boolean;
}) {
  const error = rowError(row.pred);
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const options = Object.entries(predicateLabels);
  function handleKind(event: ChangeEvent<HTMLSelectElement>) {
    onChange({ ...row, pred: defaultPredicate(event.target.value as Predicate['kind']) });
  }
  function handlePredicate(predicate: Predicate, shouldDebounce?: boolean) {
    onChange({ ...row, pred: predicate }, shouldDebounce);
  }
  return <fieldset className="FilterBuilder-row">
    <legend>{label}</legend>
    <Select label="条件の種類" value={row.pred.kind} onChange={handleKind}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    <PredicateFields predicate={row.pred} onChange={handlePredicate}
      errorId={errorId} deckCards={deckCards} />
    {error && <p id={errorId} className="FilterBuilder-error" role="status">
      {error}（この行は条件から除外しています）
    </p>}
    <div className="FilterBuilder-actions">
      <Checkbox label="〜でない" checked={row.negated} disabled={isNegationDisabled}
        aria-describedby={isNegationDisabled ? `${id}-negation` : undefined}
        onChange={event => onChange({ ...row, negated: event.target.checked })} />
      <Button onClick={onRemove}>条件を削除</Button>
    </div>
    {isNegationDisabled && <p id={`${id}-negation`} className="FilterBuilder-note">
      否定したまとまりの中の行は否定できません
    </p>}
  </fieldset>;
}
