import { useState } from 'react';
import type { Deck, DrawEffect, EffectStep } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Checkbox } from '../common/Checkbox';
import { Select } from '../common/Select';
import type { SlotOption } from '../patterns/SlotRow';
import { drawLockLabels, isStepReady } from './effectForm';
import type { EffectDraft } from './effectForm';
import { EffectSteps } from './EffectSteps';
import { EffectTemplateButtons } from './EffectTemplateButtons';
import type { EffectTemplate } from './effectTemplates';

/** 選択中の効果のカード・制約・手順を編集する。 */
export function EffectEditor({ deck, effect, cards, sources }: {
  deck: Deck; effect: DrawEffect; cards: { cardId: string; name: string }[]; sources: SlotOption[];
}) {
  const dispatch = useDispatch();
  const saved = JSON.stringify(effect);
  const [draft, setDraft] = useState<{ saved: string; value: EffectDraft }>({
    saved, value: effect,
  });
  const [revision, setRevision] = useState(0);
  if (draft.saved !== saved) setDraft({ saved, value: effect });
  const current = draft.value;
  const options = cards.filter(card => !deck.effects.some(item =>
    item.id !== effect.id && item.cardId === card.cardId));
  const hasCard = options.some(card => card.cardId === current.cardId);
  const locks = Object.entries(drawLockLabels);
  function editEffect(changes: Partial<EffectDraft>) {
    const next = { ...current, ...changes };
    setDraft({ saved, value: next });
    const steps = next.steps;
    if (steps.every((step): step is EffectStep => isStepReady(step, sources))) {
      dispatch({ type: 'effect/edit', effectId: effect.id, changes: { ...next, steps } });
    }
  }
  function applyTemplate(template: EffectTemplate) {
    editEffect(template.settings);
    setRevision(revision + 1);
  }
  return <section className="EffectsView-editor" aria-label="ドロー効果の編集">
    <Select label="カード" value={current.cardId}
      onChange={event => editEffect({ cardId: event.target.value })}>
      {!hasCard && <option value={current.cardId} disabled>メインデッキにないカード</option>}
      {options.map(card => <option key={card.cardId} value={card.cardId}>{card.name}</option>)}
    </Select>
    <Checkbox label="1 ターンに 1 回" checked={current.oncePerTurn}
      onChange={event => editEffect({ oncePerTurn: event.target.checked })} />
    <Checkbox label="最初の効果としてだけ使える" checked={current.firstOnly}
      onChange={event => editEffect({ firstOnly: event.target.checked })} />
    <Select label="ドローの制限" value={current.drawLock}
      onChange={event => editEffect({ drawLock: event.target.value as DrawEffect['drawLock'] })}>
      {locks.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    <EffectTemplateButtons onApply={applyTemplate} />
    <EffectSteps key={revision} steps={current.steps} sources={sources}
      onChange={steps => editEffect({ steps })} />
  </section>;
}
