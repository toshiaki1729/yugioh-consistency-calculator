import type { CardDb } from '../carddb/loader';
import type { CardData, CardId, DeckEntry, Section } from '../domain/types';
import { buildCardFromDetail } from './pageData';
import type { ImportPayload } from './payload';

export interface ResolvedImport {
  entries: DeckEntry[];
  pageData: Record<CardId, CardData>;
  unresolved: { name: string; count: number; section: Section; candidates: CardData[] }[];
}

export function resolveImport(payload: ImportPayload, db: CardDb): ResolvedImport {
  const entries: DeckEntry[] = [];
  const pageData: Record<CardId, CardData> = {};
  const unresolved: ResolvedImport['unresolved'] = [];
  for (const input of payload.cards) {
    let card: CardData | undefined = (input.cid === undefined ? undefined : db.getCard(`k${input.cid}`))
      ?? db.findByExactName(input.name)[0];
    if (!card && input.cid !== undefined && input.detail) {
      card = buildCardFromDetail(input.cid, input.name, input.detail) ?? undefined;
      if (card) pageData[card.id] = card;
    }
    if (!card) {
      unresolved.push({ name: input.name, count: input.count, section: input.section, candidates: db.search(input.name, 5) });
      continue;
    }
    const existing = entries.find(entry => entry.cardId === card.id && entry.section === input.section);
    if (existing) existing.count += input.count;
    else entries.push({ cardId: card.id, name: card.name, count: input.count, section: input.section });
  }
  return { entries, pageData, unresolved };
}
