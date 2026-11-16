import { MAX_EXCAVATE_COUNT, MIN_EXCAVATE_COUNT } from '../../domain/limits';
import { Checkbox } from '../common/Checkbox';
import { Select } from '../common/Select';
import { SlotSourceSelect } from '../patterns/SlotRow';
import type { SlotOption } from '../patterns/SlotRow';
import type { StepDraft } from './effectForm';
import { StepNumberField } from './StepCountFields';

type TargetProps<Kind extends StepDraft['kind']> = {
  step: Extract<StepDraft, { kind: Kind }>;
  sources: SlotOption[]; onChange: (step: StepDraft) => void;
};

/** めくる枚数と、手札に加える対象を編集する。 */
export function ExcavateFields({ step, sources, onChange }: TargetProps<'excavate'>) {
  return <>
    <StepNumberField label="めくる枚数" value={step.count}
      min={MIN_EXCAVATE_COUNT} max={MAX_EXCAVATE_COUNT}
      onChange={count => onChange({ ...step, count })} />
    <SlotSourceSelect source={step.target} sources={sources} missingLabel="未設定"
      onAny={() => onChange({ ...step, target: null })}
      onChange={target => onChange({ ...step, target })} />
  </>;
}

/** デッキから手札に加える対象を編集する。 */
export function SearchFields({ step, sources, onChange }: TargetProps<'search'>) {
  return <SlotSourceSelect source={step.target} sources={sources} missingLabel="未設定"
    onChange={target => onChange({ ...step, target })} />;
}

/** 手札から手放す対象と送り先を編集する。 */
export function HandCostFields({ step, sources, onChange }: TargetProps<'handCost'>) {
  function handleAllowMissingChange(isChecked: boolean) {
    const next = { ...step };
    if (isChecked) next.whenMissing = 'graveyard';
    else delete next.whenMissing;
    onChange(next);
  }
  return <>
    <SlotSourceSelect source={step.target} sources={sources} missingLabel="未設定"
      onChange={target => onChange({ ...step, target })} />
    <Select label="送り先" value={step.destination}
      onChange={event => onChange({ ...step,
        destination: event.target.value as typeof step.destination })}>
      <option value="graveyard">墓地</option>
      <option value="banishedFaceUp">表側で除外</option>
    </Select>
    <Checkbox label="使う前の手札に対象が無くても使う" checked={step.whenMissing !== undefined}
      onChange={event => handleAllowMissingChange(event.target.checked)} />
    {step.whenMissing !== undefined && <>
      <p className="EffectsView-note">
        この手順を処理するときに対象が無ければ、その時点の手札をすべて指定した行き先へ送ります
      </p>
      <Select label="対象が無いときの手札の行き先" value={step.whenMissing}
        onChange={event => onChange({ ...step,
          whenMissing: event.target.value as typeof step.destination })}>
        <option value="graveyard">墓地</option>
        <option value="banishedFaceUp">表側で除外</option>
      </Select>
    </>}
  </>;
}
