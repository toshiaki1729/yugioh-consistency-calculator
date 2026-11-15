import type { CardData } from '../../domain/types';
import { spellTrapPropertyLabels } from '../../domain/labels';
import { Badge } from '../common/Badge';
import './CardSummary.css';

/** カードの種類・名前とレベル等の補足を表示する。 */
export function CardSummary({ card, name }: { card?: CardData; name: string }) {
  const detail = getCardDetail(card);
  return <span className="CardSummary">
    {card ? <Badge kind={card.kind} /> : <span className="CardSummary-detail">未取得</span>}
    <span className="CardSummary-name">{card?.name ?? name}</span>
    {detail && <span className="CardSummary-detail">{detail}</span>}
  </span>;
}

function getCardDetail(card: CardData | undefined): string {
  if (card?.kind !== 'monster') return card?.property ? spellTrapPropertyLabels[card.property] : '';
  if (card.link !== undefined) return `LINK-${card.link}`;
  if (card.rank !== undefined) return `ランク${card.rank}`;
  if (card.level !== undefined) return `★${card.level}`;
  return '';
}
