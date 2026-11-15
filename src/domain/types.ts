export type CardId = string;
export type CardKind = 'monster' | 'spell' | 'trap';
export type MonsterType = 'normal' | 'effect' | 'fusion' | 'ritual' | 'synchro' | 'xyz'
  | 'pendulum' | 'link' | 'tuner' | 'flip' | 'toon' | 'spirit' | 'union' | 'gemini' | 'special';
export type Attribute = 'dark' | 'light' | 'earth' | 'water' | 'fire' | 'wind' | 'divine';
export type SpellTrapProperty = 'normal' | 'quickplay' | 'continuous' | 'equip' | 'field' | 'ritual' | 'counter';

export interface CardData {
  id: CardId;
  konamiId?: number;
  name: string;
  kana?: string;
  kind: CardKind;
  monsterTypes: MonsterType[];
  attribute?: Attribute;
  race?: string;
  level?: number;
  rank?: number;
  link?: number;
  atk?: number | null;
  def?: number | null;
  scale?: number;
  property?: SpellTrapProperty;
  text: string;
  pendulumText?: string;
  custom?: boolean;
}

export type Section = 'main' | 'extra' | 'side';
export interface DeckEntry {
  cardId: CardId;
  name: string;
  count: number;
  section: Section;
}

export type NumRange = { min?: number; max?: number };
export type Predicate =
  | { kind: 'cardKind'; values: CardKind[] }
  | { kind: 'monsterType'; values: MonsterType[]; mode: 'any' | 'all' }
  | { kind: 'attribute'; values: Attribute[] }
  | { kind: 'race'; values: string[] }
  | { kind: 'level'; range: NumRange }
  | { kind: 'rank'; range: NumRange }
  | { kind: 'link'; range: NumRange }
  | { kind: 'atk'; range: NumRange }
  | { kind: 'def'; range: NumRange }
  | { kind: 'scale'; range: NumRange }
  | { kind: 'property'; values: SpellTrapProperty[] }
  | { kind: 'nameContains'; text: string }
  | { kind: 'textContains'; text: string; includePendulum: boolean }
  | { kind: 'archetype'; text: string }
  | { kind: 'mentionsName'; text: string }
  | { kind: 'cards'; cardIds: CardId[] };
export type FilterNode =
  | { op: 'and' | 'or'; children: FilterNode[] }
  | { op: 'not'; child: FilterNode }
  | { op: 'pred'; pred: Predicate };

export interface CardGroup {
  id: string;
  name: string;
  filter: FilterNode;
  include: CardId[];
  exclude: CardId[];
}
export type SlotSource = { type: 'group'; groupId: string } | { type: 'card'; cardId: CardId };
export interface Slot { id: string; source: SlotSource; count: number; distinctNames: boolean }
export interface Pattern { id: string; name: string; enabled: boolean; slots: Slot[] }
export interface Deck {
  id: string;
  name: string;
  entries: DeckEntry[];
  groups: CardGroup[];
  patterns: Pattern[];
  customCards: CardData[];
  pageData: Record<CardId, CardData>;
  updatedAt: number;
}
export interface AppState {
  schemaVersion: 1;
  decks: Deck[];
  activeDeckId: string | null;
  settings: { customHandSize: number | null };
}
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
