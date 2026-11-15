import type { CardData } from '../../domain/types';
import { spellTrapPropertyLabels } from '../../domain/labels';
import { Badge } from '../common/Badge';
import './CardSummary.css';

export function CardSummary({ card, name }: { card?: CardData; name: string }) {
  const detail = card?.kind === 'monster'
    ? card.link !== undefined ? `LINK-${card.link}` : card.rank !== undefined ? `ランク${card.rank}` : card.level !== undefined ? `★${card.level}` : ''
    : card?.property ? spellTrapPropertyLabels[card.property] : '';
  return <span className="CardSummary">
    {card ? <Badge kind={card.kind} /> : <span className="CardSummary-detail">未取得</span>}
    <span className="CardSummary-name">{card?.name ?? name}</span>
    {detail && <span className="CardSummary-detail">{detail}</span>}
  </span>;
}
