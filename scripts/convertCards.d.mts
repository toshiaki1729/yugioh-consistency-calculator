import type { CardData } from '../src/domain/types';

/** 生成される日本語カードDBのファイル形式。 */
export interface CardDbFile {
  version: 1;
  source: 'yaml-yugi';
  generatedAt: string;
  cards: CardData[];
}

/** 変換・除外・警告の集計結果。 */
export interface ConversionStats {
  converted: number;
  skipped: number;
  warnings: number;
  warningCounts: Record<string, number>;
}

/** yaml-yugiの英語種族名に対応する日本語名。 */
export const raceTranslations: Readonly<Record<string, string>>;
/** yaml-yugiのカード1件を日本語のコンパクト形式へ変換する。 */
export function convertCard(raw: unknown): {
  card?: CardData; skipped?: string; warnings: string[];
};
/** カード一覧を変換し、ID順のDBと変換件数を返す。 */
export function convertCards(rawArray: readonly unknown[], generatedAt: string): {
  db: CardDbFile;
  stats: ConversionStats;
};
