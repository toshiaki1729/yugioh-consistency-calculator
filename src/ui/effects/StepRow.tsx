import type { ChangeEvent } from 'react';
import { MIN_EFFECT_STEPS } from '../../domain/limits';
import type { EffectStep } from '../../domain/types';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import type { SlotOption } from '../patterns/SlotRow';
import { createDefaultStep, isStepReady, stepLabels } from './effectForm';
import type { StepDraft } from './effectForm';
import { DrawFields, BanishFields } from './StepCountFields';
import { ExcavateFields, SearchFields, HandCostFields } from './StepTargetFields';

function StepFields({ step, sources, onChange }: {
  step: StepDraft; sources: SlotOption[]; onChange: (step: StepDraft) => void;
}) {
  switch (step.kind) {
    case 'draw': return <DrawFields step={step} onChange={onChange} />;
    case 'banishTop': return <BanishFields step={step} onChange={onChange} />;
    case 'excavate': return <ExcavateFields step={step} sources={sources} onChange={onChange} />;
    case 'search': return <SearchFields step={step} sources={sources} onChange={onChange} />;
    case 'handCost': return <HandCostFields step={step} sources={sources} onChange={onChange} />;
  }
}

/** 手順の種類別入力と、並べ替え・削除を表示する。 */
export function StepRow({ step, sources, index, total, onChange, onMove, onDelete }: {
  step: StepDraft; sources: SlotOption[]; index: number; total: number;
  onChange: (step: StepDraft) => void; onMove: (offset: number) => void; onDelete: () => void;
}) {
  const options = Object.entries(stepLabels);
  function handleKind(event: ChangeEvent<HTMLSelectElement>) {
    onChange(createDefaultStep(event.target.value as EffectStep['kind'], sources));
  }
  return <fieldset className="EffectsView-step">
    <legend>手順 {index + 1}</legend>
    <Select label="手順の種類" value={step.kind} onChange={handleKind}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    <StepFields key={step.kind} step={step} sources={sources} onChange={onChange} />
    {!isStepReady(step, sources) && <p className="EffectsView-warning" role="status">
      対象が未設定です。選ぶまで手順の変更は保存されません。
    </p>}
    <div className="EffectsView-actions">
      <Button aria-label={`手順 ${index + 1} を上へ`} disabled={index === 0}
        onClick={() => onMove(-1)}>↑</Button>
      <Button aria-label={`手順 ${index + 1} を下へ`} disabled={index === total - 1}
        onClick={() => onMove(1)}>↓</Button>
      <Button variant="danger" disabled={total <= MIN_EFFECT_STEPS}
        onClick={onDelete}>手順を削除</Button>
    </div>
  </fieldset>;
}
