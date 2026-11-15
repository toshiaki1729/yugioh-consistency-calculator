import type { CardKind } from '../../domain/types';
import { cardKindLabels } from '../../domain/labels';
import './Badge.css';

/** カードの種類を一文字のバッジで表示する。 */
export function Badge({ kind }: { kind: CardKind }) {
  return <span className={`Badge Badge-${kind}`} aria-label={cardKindLabels[kind]}>
    {{ monster: 'モ', spell: '魔', trap: '罠' }[kind]}
  </span>;
}
