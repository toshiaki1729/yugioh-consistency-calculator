import { useEffect, useId, useRef, useState } from 'react';
import type { CardData, CardId, FilterNode, Predicate } from '../../domain/types';
import { attributeLabels, cardKindLabels, monsterTypeLabels, races, spellTrapPropertyLabels } from '../../domain/labels';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { NumberField } from '../common/NumberField';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { defaultPredicate, fromForm, rowError, toForm } from './filterForm';
import type { FilterForm, FilterRow } from './filterForm';
import './FilterBuilder.css';

export interface FilterBuilderProps {
  value: FilterNode;
  onChange: (node: FilterNode) => void;
  deckCards: { id: CardId; name: string; card?: CardData }[];
}

const predicateLabels: Record<Predicate['kind'], string> = {
  nameContains: 'カード名キーワード', textContains: 'テキストキーワード', archetype: 'テーマ「X」カード',
  mentionsName: '「X」が記されたカード', cardKind: 'カードの種類', monsterType: 'モンスターの種類',
  attribute: '属性', race: '種族', level: 'レベル', rank: 'ランク', link: 'リンク', atk: '攻撃力',
  def: '守備力', scale: 'Pスケール', property: '魔法罠の種類', cards: '特定のカード',
};

function filterKey(node: FilterNode): string {
  // reducer の検証でプロパティ順が変わっても、同じ値の通知として扱う。
  return JSON.stringify(node, ['op', 'children', 'child', 'pred', 'kind', 'values', 'mode',
    'range', 'min', 'max', 'text', 'includePendulum', 'cardIds']);
}

function ChoiceFields<T extends string>({ options, values, onChange, errorId }: {
  options: [T, string][]; values: T[]; onChange: (values: T[]) => void; errorId?: string;
}) {
  return <div className="FilterBuilder-checks">
    {options.map(([value, label]) => <Checkbox key={value} label={label} checked={values.includes(value)}
      aria-describedby={errorId} aria-invalid={!!errorId}
      onChange={event => onChange(event.target.checked ? [...values, value] : values.filter(item => item !== value))} />)}
  </div>;
}

function ConditionRow({ row, onChange, onRemove, deckCards, label, negationDisabled = false }: {
  row: FilterRow; onChange: (row: FilterRow, debounce?: boolean) => void; onRemove: () => void;
  deckCards: FilterBuilderProps['deckCards']; label: string; negationDisabled?: boolean;
}) {
  const error = rowError(row.pred);
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const pred = row.pred;
  const fieldProps = { 'aria-invalid': !!error, 'aria-describedby': errorId };
  let fields;
  switch (pred.kind) {
    case 'nameContains': case 'textContains': case 'archetype': case 'mentionsName':
      fields = <>
        <TextField label="キーワード" value={pred.text} maxLength={100} {...fieldProps}
          onChange={event => onChange({ ...row, pred: { ...pred, text: event.target.value } }, true)} />
        {pred.kind === 'textContains' && <Checkbox label="ペンデュラム効果を含む" checked={pred.includePendulum}
          onChange={event => onChange({ ...row, pred: { ...pred, includePendulum: event.target.checked } })} />}
        {pred.kind === 'archetype' && <p className="FilterBuilder-note">テーマ判定はカード名・読み・『〜カードとしても扱う』の記述による近似です。違う場合はグループで手動追加・除外してください</p>}
        {pred.kind === 'mentionsName' && <p className="FilterBuilder-note">『X』の記述による近似です（『X』モンスター のようなテーマ指定は除きます）。違う場合は手動で追加・除外してください</p>}
      </>;
      break;
    case 'level': case 'rank': case 'link': case 'atk': case 'def': case 'scale':
      fields = <div className="FilterBuilder-range">
        {(['min', 'max'] as const).map(bound => <NumberField key={bound} label={bound === 'min' ? '以上' : '以下'}
          value={pred.range[bound]} {...fieldProps} onChange={value => {
            const range = { ...pred.range };
            if (value === undefined) delete range[bound];
            else range[bound] = value;
            onChange({ ...row, pred: { ...pred, range } }, true);
          }} />)}
      </div>;
      break;
    case 'cardKind':
      fields = <ChoiceFields options={Object.entries(cardKindLabels) as [typeof pred.values[number], string][]} values={pred.values}
        errorId={errorId} onChange={values => onChange({ ...row, pred: { ...pred, values } })} />;
      break;
    case 'monsterType':
      fields = <>
        <Select label="モンスターの種類の一致" value={pred.mode}
          onChange={event => onChange({ ...row, pred: { ...pred, mode: event.target.value as 'any' | 'all' } })}>
          <option value="any">いずれか</option><option value="all">すべて</option>
        </Select>
        <ChoiceFields options={Object.entries(monsterTypeLabels) as [typeof pred.values[number], string][]} values={pred.values}
          errorId={errorId} onChange={values => onChange({ ...row, pred: { ...pred, values } })} />
      </>;
      break;
    case 'attribute':
      fields = <ChoiceFields options={Object.entries(attributeLabels) as [typeof pred.values[number], string][]} values={pred.values}
        errorId={errorId} onChange={values => onChange({ ...row, pred: { ...pred, values } })} />;
      break;
    case 'race':
      fields = <ChoiceFields options={[...new Set<string>([...races, ...pred.values])].map(race => [race, race])} values={pred.values}
        errorId={errorId} onChange={values => onChange({ ...row, pred: { ...pred, values } })} />;
      break;
    case 'property':
      fields = <ChoiceFields options={Object.entries(spellTrapPropertyLabels) as [typeof pred.values[number], string][]} values={pred.values}
        errorId={errorId} onChange={values => onChange({ ...row, pred: { ...pred, values } })} />;
      break;
    case 'cards':
      fields = <>
        <ChoiceFields options={deckCards.map(card => [card.id, card.name])} values={pred.cardIds}
          errorId={errorId} onChange={cardIds => onChange({ ...row, pred: { ...pred, cardIds } })} />
        {pred.cardIds.filter(id => !deckCards.some(card => card.id === id)).map(id =>
          <Checkbox key={id} label={`メインデッキ外のカード（${id}）`} checked
            onChange={() => onChange({ ...row, pred: { ...pred, cardIds: pred.cardIds.filter(cardId => cardId !== id) } })} />)}
        {deckCards.length === 0 && <p className="FilterBuilder-note">メインデッキにカードを追加してください。</p>}
      </>;
      break;
  }
  return <fieldset className="FilterBuilder-row">
    <legend>{label}</legend>
    <Select label="条件の種類" value={pred.kind}
      onChange={event => onChange({ ...row, pred: defaultPredicate(event.target.value as Predicate['kind']) })}>
      {Object.entries(predicateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    {fields}
    {error && <p id={errorId} className="FilterBuilder-error" role="status">{error}（この行は条件から除外しています）</p>}
    <div className="FilterBuilder-actions">
      <Checkbox label="〜でない" checked={row.negated} disabled={negationDisabled}
        aria-describedby={negationDisabled ? `${id}-negation` : undefined}
        onChange={event => onChange({ ...row, negated: event.target.checked })} />
      <Button onClick={onRemove}>条件を削除</Button>
    </div>
    {negationDisabled && <p id={`${id}-negation`} className="FilterBuilder-note">否定したまとまりの中の行は否定できません</p>}
  </fieldset>;
}

function OperatorSelect({ value, onChange, label }: {
  value: 'and' | 'or'; onChange: (value: 'and' | 'or') => void; label: string;
}) {
  return <Select label={label} value={value} onChange={event => onChange(event.target.value as 'and' | 'or')}>
    <option value="and">すべて満たす（AND）</option><option value="or">いずれかを満たす（OR）</option>
  </Select>;
}

export function FilterBuilder({ value, onChange, deckCards }: FilterBuilderProps) {
  const [parsed, setParsed] = useState(() => toForm(value));
  const lastEmitted = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueKey = filterKey(value);

  useEffect(() => {
    // 親から返った条件には未完成の行がないため、自分の通知では編集中のフォームを作り直さない。
    if (valueKey === lastEmitted.current) return;
    clearTimeout(timer.current);
    setParsed(toForm(value));
    lastEmitted.current = null;
  }, [valueKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!parsed.ok) return <p role="status">この条件は画面では編集できません</p>;
  const form = parsed.value;
  const cards = [...deckCards].sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  function update(next: FilterForm, debounce = false) {
    setParsed({ ok: true, value: next });
    clearTimeout(timer.current);
    const notify = () => {
      const node = fromForm(next);
      lastEmitted.current = filterKey(node);
      onChangeRef.current(node);
    };
    if (debounce) timer.current = setTimeout(notify, 150);
    else notify();
  }

  return <div className="FilterBuilder">
    <OperatorSelect label="条件全体の一致" value={form.op} onChange={op => update({ ...form, op })} />
    {form.rows.map((row, index) => row.type === 'row'
      ? <ConditionRow key={index} row={row} label={`条件 ${index + 1}`} deckCards={cards}
        onChange={(next, debounce) => update({ ...form, rows: form.rows.map((item, i) => i === index ? next : item) }, debounce)}
        onRemove={() => update({ ...form, rows: form.rows.filter((_, i) => i !== index) })} />
      : <fieldset className="FilterBuilder-group" key={index}>
        <legend>条件のまとまり {index + 1}</legend>
        <OperatorSelect label="まとまりの一致" value={row.op}
          onChange={op => update({ ...form, rows: form.rows.map((item, i) => i === index ? { ...row, op } : item) })} />
        {row.rows.map((child, childIndex) => <ConditionRow key={childIndex} row={child}
          label={`条件 ${index + 1}.${childIndex + 1}`} deckCards={cards} negationDisabled={row.negated}
          onChange={(next, debounce) => update({ ...form, rows: form.rows.map((item, i) => i === index
            ? { ...row, rows: row.rows.map((item, j) => j === childIndex ? next : item) } : item) }, debounce)}
          onRemove={() => update({ ...form, rows: form.rows.map((item, i) => i === index
            ? { ...row, rows: row.rows.filter((_, j) => j !== childIndex) } : item) })} />)}
        {!row.rows.some(child => !rowError(child.pred)) &&
          <p className="FilterBuilder-note" role="status">条件がないため無視しています</p>}
        <div className="FilterBuilder-actions">
          <Button onClick={() => update({ ...form, rows: form.rows.map((item, i) => i === index
            ? { ...row, rows: [...row.rows, { type: 'row', pred: defaultPredicate('nameContains'), negated: false }] } : item) })}>条件を追加</Button>
          <Checkbox label="まとまりを否定" checked={row.negated}
            onChange={event => update({ ...form, rows: form.rows.map((item, i) => i === index ? {
              ...row, negated: event.target.checked,
              rows: event.target.checked ? row.rows.map(child => ({ ...child, negated: false })) : row.rows,
            } : item) })} />
          <Button onClick={() => update({ ...form, rows: form.rows.filter((_, i) => i !== index) })}>まとまりを削除</Button>
        </div>
      </fieldset>)}
    <div className="FilterBuilder-actions">
      <Button onClick={() => update({ ...form, rows: [...form.rows, { type: 'row', pred: defaultPredicate('nameContains'), negated: false }] })}>条件を追加</Button>
      <Button onClick={() => update({ ...form, rows: [...form.rows, { type: 'group', op: 'and', rows: [], negated: false }] })}>条件のまとまりを追加</Button>
    </div>
  </div>;
}
