import type { CardData } from '../src/domain/types';

export interface CardDbFile {
  version: 1;
  source: 'yaml-yugi';
  generatedAt: string;
  cards: CardData[];
}

export interface ConversionStats {
  converted: number;
  skipped: number;
  warnings: number;
  warningCounts: Record<string, number>;
}

export const raceTranslations: Readonly<Record<string, string>>;
export function convertCard(raw: unknown): { card?: CardData; skipped?: string; warnings: string[] };
export function convertCards(rawArray: readonly unknown[], generatedAt: string): {
  db: CardDbFile;
  stats: ConversionStats;
};
