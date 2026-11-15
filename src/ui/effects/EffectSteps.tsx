import { useRef, useState } from 'react';
import { MAX_EFFECT_STEPS, MIN_DRAW_COUNT } from '../../domain/limits';
import { Button } from '../common/Button';
import type { SlotOption } from '../patterns/SlotRow';
import type { StepDraft } from './effectForm';
import { StepRow } from './StepRow';

const STEP_FIELDS = ['kind', 'count', 'target', 'type', 'cardId', 'groupId', 'destination'];

/** 手順を編集し、入力途中の行も並べ替え後に保持する。 */
export function EffectSteps({ steps, sources, onChange }: {
  steps: StepDraft[]; sources: SlotOption[]; onChange: (steps: StepDraft[]) => void;
}) {
  const saved = JSON.stringify(steps, STEP_FIELDS);
  const nextId = useRef(steps.length);
  const [draft, setDraft] = useState({ saved,
    rows: steps.map((step, id) => ({ id: String(id), step })),
  });
  if (draft.saved !== saved) {
    setDraft({ saved, rows: steps.map((step, index) => ({
      id: `${saved}:${index}`, step,
    })) });
  }
  function updateRows(rows: typeof draft.rows) {
    const steps = rows.map(row => row.step);
    setDraft({ saved: JSON.stringify(steps, STEP_FIELDS), rows });
    onChange(steps);
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
