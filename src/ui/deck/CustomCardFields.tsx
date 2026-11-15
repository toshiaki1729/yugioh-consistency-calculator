import type { ChangeEvent } from 'react';
import type { Attribute, CardData, MonsterType, SpellTrapProperty } from '../../domain/types';
import {
  attributeLabels, monsterTypeLabels, races, spellTrapPropertyLabels,
} from '../../domain/labels';
import { Checkbox } from '../common/Checkbox';
import { NumberField } from '../common/NumberField';
import { Select } from '../common/Select';

interface CardFieldsProps {
  draft: CardData;
  onChange: (changes: Partial<CardData>) => void;
}

/** モンスターの種類・属性・数値の編集欄を表示する。 */
export function MonsterFields({ draft, onChange }: CardFieldsProps) {
  const types = Object.entries(monsterTypeLabels) as [MonsterType, string][];
  const attributes = Object.entries(attributeLabels);
  const hasCustomRace = draft.race && !races.some(race => race === draft.race);
  const isLink = draft.monsterTypes.includes('link');
  const isPendulum = draft.monsterTypes.includes('pendulum');
  const stats = (['atk', 'def'] as const).filter(key => key !== 'def' || !isLink);
  let levelField: 'link' | 'rank' | 'level' = 'level';
  if (isLink) levelField = 'link';
  else if (draft.monsterTypes.includes('xyz')) levelField = 'rank';
  const levelLabels = { link: 'リンク', rank: 'ランク', level: 'レベル' };
  function renderType([value, label]: [MonsterType, string]) {
    return <MonsterTypeField key={value} value={value} label={label}
      draft={draft} onChange={onChange} />;
  }
  function renderStat(field: 'atk' | 'def') {
    return <MonsterStatField key={field} field={field} draft={draft} onChange={onChange} />;
  }
  return <>
    <fieldset className="CustomCardForm-types">
      <legend>モンスターの種類</legend>
      <div className="CustomCardForm-checks">{types.map(renderType)}</div>
    </fieldset>
    <div className="CustomCardForm-grid">
      <Select label="属性" value={draft.attribute ?? ''}
        onChange={event => onChange({ attribute: event.target.value as Attribute || undefined })}>
        <option value="">未指定</option>
        {attributes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Select label="種族" value={draft.race ?? ''}
        onChange={event => onChange({ race: event.target.value || undefined })}>
        <option value="">未指定</option>
        {hasCustomRace && <option value={draft.race}>{draft.race}</option>}
        {races.map(race => <option key={race} value={race}>{race}</option>)}
      </Select>
      <NumberField label={levelLabels[levelField]} value={draft[levelField]}
        onChange={value => onChange({ [levelField]: value })} />
      {isPendulum && <NumberField label="Pスケール" value={draft.scale}
        onChange={scale => onChange({ scale })} />}
      {stats.map(renderStat)}
    </div>
  </>;
}

function MonsterTypeField({ draft, onChange, value, label }: CardFieldsProps & {
  value: MonsterType; label: string;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const monsterTypes = event.target.checked ? [...draft.monsterTypes, value]
      : draft.monsterTypes.filter(type => type !== value);
    onChange({ monsterTypes });
  }
  return <Checkbox label={label} checked={draft.monsterTypes.includes(value)}
    onChange={handleChange} />;
}

function MonsterStatField({ draft, onChange, field }: CardFieldsProps & { field: 'atk' | 'def' }) {
  const label = field === 'atk' ? '攻撃力' : '守備力';
  return <div className="CustomCardForm-stat">
    <NumberField label={label} value={draft[field] ?? undefined} disabled={draft[field] === null}
      onChange={value => onChange({ [field]: value })} />
    <Checkbox label={`${label}を ? にする`} checked={draft[field] === null}
      onChange={event => onChange({ [field]: event.target.checked ? null : undefined })} />
  </div>;
}

/** 魔法・罠の種類に対応する選択肢を表示する。 */
export function SpellTrapField({ draft, onChange }: CardFieldsProps) {
  const properties = Object.entries(spellTrapPropertyLabels).filter(([value]) =>
    draft.kind === 'spell' ? value !== 'counter'
      : ['normal', 'continuous', 'counter'].includes(value));
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange({ property: event.target.value as SpellTrapProperty || undefined });
  }
  return <Select label="魔法罠の種類" value={draft.property ?? ''}
    onChange={handleChange}>
    <option value="">未指定</option>
    {properties.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
  </Select>;
}
