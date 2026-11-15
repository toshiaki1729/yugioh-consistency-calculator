import { useId, useState } from 'react';
import {
  MAX_BANISH_COUNT, MAX_DRAW_COUNT, MIN_BANISH_COUNT, MIN_DRAW_COUNT,
} from '../../domain/limits';
import type { EffectStep } from '../../domain/types';
import { NumberField } from '../common/NumberField';

/** 範囲外の枚数は画面内に保持して、確定値だけを反映する。 */
export function StepNumberField({ label, value, min, max, onChange }: {
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
  return <div className="EffectsView-number">
    <NumberField label={label} value={draft.value} min={min} max={max} required
      aria-invalid={!isValid} aria-describedby={errorId} onChange={handleChange} />
    {!isValid && <p id={errorId} className="EffectsView-warning" role="status">
      {min}〜{max}{' '}の整数を入力してください（この値は保存されていません）。
    </p>}
  </div>;
}

/** ドローする枚数を編集する。 */
export function DrawFields({ step, onChange }: {
  step: Extract<EffectStep, { kind: 'draw' }>; onChange: (step: EffectStep) => void;
}) {
  return <StepNumberField label="ドロー枚数" value={step.count}
    min={MIN_DRAW_COUNT} max={MAX_DRAW_COUNT}
    onChange={count => onChange({ ...step, count })} />;
}

/** デッキの上から裏側で除外する枚数を編集する。 */
export function BanishFields({ step, onChange }: {
  step: Extract<EffectStep, { kind: 'banishTop' }>; onChange: (step: EffectStep) => void;
}) {
  return <StepNumberField label="裏側で除外する枚数" value={step.count}
    min={MIN_BANISH_COUNT} max={MAX_BANISH_COUNT}
    onChange={count => onChange({ ...step, count })} />;
}
