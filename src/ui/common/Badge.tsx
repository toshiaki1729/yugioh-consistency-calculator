import type { CardKind } from '../../domain/types';
import { cardKindLabels } from '../../domain/labels';
import './Badge.css';

export function Badge({ kind }: { kind: CardKind }) {
  return <span className={`Badge Badge-${kind}`} aria-label={cardKindLabels[kind]}>
    {{ monster: 'モ', spell: '魔', trap: '罠' }[kind]}
  </span>;
}
