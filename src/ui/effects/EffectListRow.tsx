import { useResolveCard } from '../../carddb/useCardDb';
import type { Deck, DrawEffect } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { IconButton } from '../common/IconButton';
import { drawLockLabels, summarizeStep } from './effectForm';

/** カード名・制約・手順の要約と優先順の操作を表示する。 */
export function EffectListRow({ deck, effect, index, isSelected, onSelect, onMove }: {
  deck: Deck; effect: DrawEffect; index: number; isSelected: boolean;
  onSelect: (id: string) => void; onMove: (index: number, offset: number) => void;
}) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const entry = deck.entries.find(card => card.cardId === effect.cardId);
  const name = resolveCard(effect.cardId)?.name ?? entry?.name ?? effect.cardId;
  const isInMain = deck.entries.some(card =>
    card.cardId === effect.cardId && card.section === 'main');
  const settings = [];
  if (effect.oncePerTurn) settings.push('1 ターンに 1 回');
  if (effect.firstOnly) settings.push('最初だけ');
  if (effect.drawLock !== 'none') settings.push(drawLockLabels[effect.drawLock]);
  const summary = effect.steps.map(summarizeStep).join(' → ');
  function handleDelete() { dispatch({ type: 'effect/delete', effectId: effect.id }); }
  return <li className="EffectsView-row" aria-label={name}>
    <Button className="EffectsView-choice" aria-pressed={isSelected}
      onClick={() => onSelect(effect.id)}>
      <strong>{name}</strong>
      {settings.length > 0 && <span className="EffectsView-note">{settings.join(' / ')}</span>}
      <span>{summary}</span>
      {!isInMain && <span className="EffectsView-warning">デッキにないため使われません</span>}
    </Button>
    <div className="EffectsView-actions">
      <IconButton aria-label={`${name}を上へ`} disabled={index === 0}
        onClick={() => onMove(index, -1)}>↑</IconButton>
      <IconButton aria-label={`${name}を下へ`} disabled={index === deck.effects.length - 1}
        onClick={() => onMove(index, 1)}>↓</IconButton>
      <Button variant="danger" onClick={handleDelete}>削除</Button>
    </div>
  </li>;
}
