import type { ChangeEvent } from 'react';
import { MIN_REMAINING_COUNT } from '../../domain/limits';
import type { CardTarget, MoveZone, PatternCondition } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { ConditionFields } from './ConditionFields';
import { SlotSourceSelect } from './SlotRow';
import type { SlotOption } from './SlotRow';

const DEFAULT_BANISH_COUNT = 3;
const DEFAULT_MOVE_ZONE: MoveZone = 'banishedFaceUp';
const conditionLabels: Record<PatternCondition['kind'], string> = {
  deckAtLeast: 'デッキに残っている',
  movedExcludes: 'ドロー効果で送ったカードに含まれない',
  movedIncludes: 'ドロー効果で送ったカードに含まれる',
  deckAfterBanish: 'デッキの上から除外しても残っている',
};
const movedNote = 'ドロー効果の手順で墓地・除外へ送ったカードです。ドロー効果がないデッキでは、「含まれない」は常に満たし、「含まれる」は満たしません。';
const conditionNotes: Record<PatternCondition['kind'], string> = {
  deckAtLeast: '判定の時点でデッキに残っている枚数です（例: 素引きすると使えなくなるカード）。',
  movedExcludes: movedNote,
  movedIncludes: movedNote,
  deckAfterBanish: 'この条件があると、計算はシミュレーションになります。',
};

/** 対象を保ち、種類に応じた既定の条件を作る。 */
export function createDefaultCondition(kind: PatternCondition['kind'], target: CardTarget)
  : PatternCondition {
  if (kind === 'movedExcludes' || kind === 'movedIncludes') {
    return { kind, target, zones: [DEFAULT_MOVE_ZONE] };
  }
  if (kind === 'deckAfterBanish') {
    return { kind, target, count: MIN_REMAINING_COUNT, banish: DEFAULT_BANISH_COUNT };
  }
  return { kind, target, count: MIN_REMAINING_COUNT };
}

/** 追加の条件の種類・対象・値と削除を編集する。 */
export function ConditionEditorRow({ patternId, condition, index, sources }: {
  patternId: string; condition: PatternCondition; index: number; sources: SlotOption[];
}) {
  const dispatch = useDispatch();
  const options = Object.entries(conditionLabels);
  function editCondition(next: PatternCondition) {
    dispatch({ type: 'condition/edit', patternId, index, condition: next });
  }
  function handleKind(event: ChangeEvent<HTMLSelectElement>) {
    const kind = event.target.value as PatternCondition['kind'];
    editCondition(createDefaultCondition(kind, condition.target));
  }
  function handleDelete() {
    dispatch({ type: 'condition/delete', patternId, index });
  }
  return <fieldset className="PatternsView-slot">
    <legend>条件 {index + 1}</legend>
    <Select label="条件の種類" value={condition.kind} onChange={handleKind}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    <SlotSourceSelect source={condition.target} sources={sources}
      onChange={target => editCondition({ ...condition, target })} />
    <ConditionFields key={condition.kind} condition={condition} onChange={editCondition} />
    <p className="PatternsView-note">{conditionNotes[condition.kind]}</p>
    <div className="PatternsView-actions">
      <Button variant="danger" onClick={handleDelete}>条件を削除</Button>
    </div>
  </fieldset>;
}
