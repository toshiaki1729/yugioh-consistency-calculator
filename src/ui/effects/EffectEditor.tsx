import type { Deck, DrawEffect } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Checkbox } from '../common/Checkbox';
import { Select } from '../common/Select';
import type { SlotOption } from '../patterns/SlotRow';
import { drawLockLabels } from './effectForm';
import { EffectSteps } from './EffectSteps';

/** 選択中の効果のカード・制約・手順を編集する。 */
export function EffectEditor({ deck, effect, cards, sources }: {
  deck: Deck; effect: DrawEffect; cards: { cardId: string; name: string }[]; sources: SlotOption[];
}) {
  const dispatch = useDispatch();
  const options = cards.filter(card => !deck.effects.some(item =>
    item.id !== effect.id && item.cardId === card.cardId));
  const hasCard = options.some(card => card.cardId === effect.cardId);
  const locks = Object.entries(drawLockLabels);
  function editEffect(changes: Partial<Omit<DrawEffect, 'id'>>) {
    dispatch({ type: 'effect/edit', effectId: effect.id, changes });
  }
  return <section className="EffectsView-editor" aria-label="ドロー効果の編集">
    <Select label="カード" value={effect.cardId}
      onChange={event => editEffect({ cardId: event.target.value })}>
      {!hasCard && <option value={effect.cardId} disabled>メインデッキにないカード</option>}
      {options.map(card => <option key={card.cardId} value={card.cardId}>{card.name}</option>)}
    </Select>
    <Checkbox label="1 ターンに 1 回" checked={effect.oncePerTurn}
      onChange={event => editEffect({ oncePerTurn: event.target.checked })} />
    <Checkbox label="最初の効果としてだけ使える" checked={effect.firstOnly}
      onChange={event => editEffect({ firstOnly: event.target.checked })} />
    <Select label="ドローの制限" value={effect.drawLock}
      onChange={event => editEffect({ drawLock: event.target.value as DrawEffect['drawLock'] })}>
      {locks.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    <EffectSteps effect={effect} sources={sources} onChange={steps => editEffect({ steps })} />
  </section>;
}
