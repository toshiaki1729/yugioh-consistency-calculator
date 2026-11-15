import type { Section } from '../../domain/types';

/** デッキ内の表示順と追加先に使う区分。 */
export const deckSections: { value: Section; label: string }[] = [
  { value: 'main', label: 'メイン' },
  { value: 'extra', label: 'エクストラ' },
  { value: 'side', label: 'サイド' },
];
