import { useId, useState } from 'react';
import {
  MAX_BANISH_COUNT, MAX_REMAINING_COUNT, MIN_BANISH_COUNT, MIN_MOVE_ZONES, MIN_REMAINING_COUNT,
} from '../../domain/limits';
import type { MoveZone, PatternCondition } from '../../domain/types';
import { Checkbox } from '../common/Checkbox';
import { NumberField } from '../common/NumberField';

const zoneLabels: Record<MoveZone, string> = {
  graveyard: '墓地', banishedFaceUp: '表側で除外', banishedFaceDown: '裏側で除外',
};

function ConditionNumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ saved: number; value: number | undefined }>({
    saved: value, value,
  });
  if (draft.saved !== value) setDraft({ saved: value, value });
  const isValid = draft.value !== undefined && draft.value >= min && draft.value <= max;
  const errorId = isValid ? undefined : `${id}-error`;
  function handleChange(next: number | undefined) {
    setDraft({ saved: value, value: next });
    if (next !== undefined && next >= min && next <= max) onChange(next);
  }
  return <div className="PatternsView-number">
    <NumberField label={label} value={draft.value} min={min} max={max} required
      aria-invalid={!isValid} aria-describedby={errorId} onChange={handleChange} />
    {!isValid && <p id={errorId} className="PatternsView-warning" role="status">
      {min}〜{max}{' '}の整数を入力してください（この値は保存されていません）。
    </p>}
  </div>;
}

function ConditionZone({ zone, condition, onChange }: {
  zone: MoveZone; condition: Extract<PatternCondition, { zones: MoveZone[] }>;
  onChange: (condition: PatternCondition) => void;
}) {
  const isChecked = condition.zones.includes(zone);
  function handleChange() {
    const zones = isChecked ? condition.zones.filter(item => item !== zone)
      : [...condition.zones, zone];
    onChange({ ...condition, zones });
  }
  return <Checkbox label={zoneLabels[zone]} checked={isChecked}
    disabled={isChecked && condition.zones.length === MIN_MOVE_ZONES} onChange={handleChange} />;
}

/** 条件の種類に応じて送り先または保存範囲付きの枚数を入力する。 */
export function ConditionFields({ condition, onChange }: {
  condition: PatternCondition; onChange: (condition: PatternCondition) => void;
}) {
  if (condition.kind === 'movedIncludes' || condition.kind === 'movedExcludes') {
    const zones = Object.keys(zoneLabels) as MoveZone[];
    return <fieldset className="PatternsView-slot">
      <legend>送り先</legend>
      <div className="PatternsView-actions">{zones.map(zone =>
        <ConditionZone key={zone} zone={zone} condition={condition} onChange={onChange} />)}</div>
    </fieldset>;
  }
  return <div className="PatternsView-condition-counts">
    {condition.kind === 'deckAfterBanish' &&
      <ConditionNumberField label="上から X 枚を除外" value={condition.banish}
        min={MIN_BANISH_COUNT} max={MAX_BANISH_COUNT}
        onChange={banish => onChange({ ...condition, banish })} />}
    <ConditionNumberField label="N 枚以上" value={condition.count}
      min={MIN_REMAINING_COUNT} max={MAX_REMAINING_COUNT}
      onChange={count => onChange({ ...condition, count })} />
  </div>;
}
