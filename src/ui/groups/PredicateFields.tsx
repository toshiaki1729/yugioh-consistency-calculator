import type { ChangeEvent } from 'react';
import type { NumRange, Predicate } from '../../domain/types';
import {
  attributeLabels, cardKindLabels, monsterTypeLabels, races, spellTrapPropertyLabels,
} from '../../domain/labels';
import { MAX_KEYWORD_LENGTH } from '../../domain/limits';
import { Checkbox } from '../common/Checkbox';
import { NumberField } from '../common/NumberField';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { ChoiceFields } from './ChoiceFields';
import type { FilterBuilderProps } from './FilterBuilder';

interface PredicateFieldsProps<T extends Predicate = Predicate> {
  predicate: T;
  onChange: (predicate: Predicate, shouldDebounce?: boolean) => void;
  errorId?: string;
  deckCards: FilterBuilderProps['deckCards'];
}

function KeywordFields({ predicate, onChange, errorId }: PredicateFieldsProps<
  Extract<Predicate, { text: string }>
>) {
  function handleKeyword(event: ChangeEvent<HTMLInputElement>) {
    onChange({ ...predicate, text: event.target.value }, true);
  }
  function handlePendulum(event: ChangeEvent<HTMLInputElement>) {
    if (predicate.kind === 'textContains') {
      onChange({ ...predicate, includePendulum: event.target.checked });
    }
  }
  return <>
    <TextField label="キーワード" value={predicate.text} maxLength={MAX_KEYWORD_LENGTH}
      aria-invalid={!!errorId} aria-describedby={errorId} onChange={handleKeyword} />
    {predicate.kind === 'textContains' &&
      <Checkbox label="ペンデュラム効果を含む" checked={predicate.includePendulum}
        onChange={handlePendulum} />}
    {predicate.kind === 'archetype' && <p className="FilterBuilder-note">
      テーマ判定はカード名・読み・『〜カードとしても扱う』の記述による近似です。一致しない場合は手動で追加・除外してください。
    </p>}
    {predicate.kind === 'mentionsName' && <p className="FilterBuilder-note">
      テキスト内の『○○』の記述による近似です（『○○』モンスターのようなテーマ指定は除きます）。一致しない場合は手動で追加・除外してください。
    </p>}
  </>;
}

function RangeBound({ predicate, bound, errorId, onChange }: PredicateFieldsProps<
  Extract<Predicate, { range: NumRange }>
> & { bound: 'min' | 'max' }) {
  function handleChange(value: number | undefined) {
    const range = { ...predicate.range };
    if (value === undefined) delete range[bound];
    else range[bound] = value;
    onChange({ ...predicate, range }, true);
  }
  return <NumberField label={bound === 'min' ? '以上' : '以下'} value={predicate.range[bound]}
    aria-invalid={!!errorId} aria-describedby={errorId} onChange={handleChange} />;
}

function MonsterTypeFields({ predicate, onChange, errorId }: PredicateFieldsProps<
  Extract<Predicate, { kind: 'monsterType' }>
>) {
  const options = Object.entries(monsterTypeLabels) as [typeof predicate.values[number], string][];
  function handleMode(event: ChangeEvent<HTMLSelectElement>) {
    onChange({ ...predicate, mode: event.target.value as 'any' | 'all' });
  }
  return <>
    <Select label="モンスターの種類の一致" value={predicate.mode} onChange={handleMode}>
      <option value="any">いずれか</option><option value="all">すべて</option>
    </Select>
    <ChoiceFields options={options} values={predicate.values} errorId={errorId}
      onChange={values => onChange({ ...predicate, values })} />
  </>;
}

function OutsideCardField({ cardId, predicate, onChange }: {
  cardId: string;
} & PredicateFieldsProps<Extract<Predicate, { kind: 'cards' }>>) {
  function handleRemove() {
    onChange({ ...predicate, cardIds: predicate.cardIds.filter(id => id !== cardId) });
  }
  return <Checkbox label={`メインデッキ外のカード（${cardId}）`} checked
    onChange={handleRemove} />;
}

function CardFields(props: PredicateFieldsProps<Extract<Predicate, { kind: 'cards' }>>) {
  const { predicate, onChange, errorId, deckCards } = props;
  const options: [string, string][] = deckCards.map(card => [card.id, card.name]);
  const outsideIds = predicate.cardIds.filter(id => !deckCards.some(card => card.id === id));
  return <>
    <ChoiceFields options={options} values={predicate.cardIds} errorId={errorId}
      onChange={cardIds => onChange({ ...predicate, cardIds })} />
    {outsideIds.map(cardId => <OutsideCardField key={cardId} cardId={cardId} {...props} />)}
    {deckCards.length === 0 &&
      <p className="FilterBuilder-note">メインデッキにカードを追加してください。</p>}
  </>;
}

/** 条件の種類に対応する値の入力欄を表示する。 */
export function PredicateFields({ predicate, ...props }: PredicateFieldsProps) {
  const { onChange, errorId } = props;
  switch (predicate.kind) {
    case 'nameContains': case 'textContains': case 'archetype': case 'mentionsName':
      return <KeywordFields predicate={predicate} {...props} />;
    case 'level': case 'rank': case 'link': case 'atk': case 'def': case 'scale':
      return <div className="FilterBuilder-range">
        <RangeBound bound="min" predicate={predicate} {...props} />
        <RangeBound bound="max" predicate={predicate} {...props} />
      </div>;
    case 'monsterType': return <MonsterTypeFields predicate={predicate} {...props} />;
    case 'cards': return <CardFields predicate={predicate} {...props} />;
    case 'cardKind': {
      const options = Object.entries(cardKindLabels) as [typeof predicate.values[number], string][];
      return <ChoiceFields options={options} values={predicate.values} errorId={errorId}
        onChange={values => onChange({ ...predicate, values })} />;
    }
    case 'attribute': {
      const options = Object.entries(attributeLabels) as
        [typeof predicate.values[number], string][];
      return <ChoiceFields options={options} values={predicate.values} errorId={errorId}
        onChange={values => onChange({ ...predicate, values })} />;
    }
    case 'race': {
      const options: [string, string][] = [...new Set<string>([...races, ...predicate.values])]
        .map(race => [race, race]);
      return <ChoiceFields options={options} values={predicate.values} errorId={errorId}
        onChange={values => onChange({ ...predicate, values })} />;
    }
    case 'property': {
      const options = Object.entries(spellTrapPropertyLabels) as
        [typeof predicate.values[number], string][];
      return <ChoiceFields options={options} values={predicate.values} errorId={errorId}
        onChange={values => onChange({ ...predicate, values })} />;
    }
  }
}
