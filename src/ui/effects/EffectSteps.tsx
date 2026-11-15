import { useRef, useState } from 'react';
import { MAX_EFFECT_STEPS, MIN_DRAW_COUNT } from '../../domain/limits';
import type { DrawEffect, EffectStep } from '../../domain/types';
import { Button } from '../common/Button';
import type { SlotOption } from '../patterns/SlotRow';
import { isStepReady } from './effectForm';
import type { StepDraft } from './effectForm';
import { StepRow } from './StepRow';

const STEP_FIELDS = ['kind', 'count', 'target', 'type', 'cardId', 'groupId', 'destination'];

/** 未設定の手順を画面内で保持し、全対象が確定したときに保存する。 */
export function EffectSteps({ effect, sources, onChange }: {
  effect: DrawEffect; sources: SlotOption[]; onChange: (steps: EffectStep[]) => void;
}) {
  const saved = JSON.stringify(effect.steps, STEP_FIELDS);
  const nextId = useRef(effect.steps.length);
  const [draft, setDraft] = useState({ saved,
    rows: effect.steps.map((step, id) => ({ id: String(id), step: step as StepDraft })),
  });
  if (draft.saved !== saved) {
    setDraft({ saved, rows: effect.steps.map((step, index) => ({
      id: `${saved}:${index}`, step,
    })) });
  }
  function updateRows(rows: typeof draft.rows) {
    const steps = rows.map(row => row.step);
    const canSave = steps.every((step): step is EffectStep => isStepReady(step, sources));
    setDraft({ saved: canSave ? JSON.stringify(steps, STEP_FIELDS) : saved, rows });
    if (canSave) onChange(steps);
  }
  function editStep(index: number, step: StepDraft) {
    updateRows(draft.rows.map((row, position) => position === index ? { ...row, step } : row));
  }
  function moveStep(index: number, offset: number) {
    const rows = [...draft.rows];
    [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]];
    updateRows(rows);
  }
  function handleAdd() {
    updateRows([...draft.rows, { id: String(nextId.current++),
      step: { kind: 'draw', count: MIN_DRAW_COUNT } }]);
  }
  function deleteStep(index: number) {
    updateRows(draft.rows.filter((_, position) => position !== index));
  }
  return <div className="EffectsView-steps">
    {draft.rows.map((row, index) => <StepRow key={row.id} step={row.step} index={index}
      total={draft.rows.length} sources={sources} onChange={next => editStep(index, next)}
      onMove={offset => moveStep(index, offset)} onDelete={() => deleteStep(index)} />)}
    <Button disabled={draft.rows.length >= MAX_EFFECT_STEPS} onClick={handleAdd}>手順を追加</Button>
  </div>;
}
