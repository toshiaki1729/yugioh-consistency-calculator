/** カード DB またはカスタムカードの識別子。 */
export type CardId = string;
/** カードの大分類。 */
export type CardKind = 'monster' | 'spell' | 'trap';
/** モンスターに付く種類の指定。 */
export type MonsterType = 'normal' | 'effect' | 'fusion' | 'ritual' | 'synchro' | 'xyz'
  | 'pendulum' | 'link' | 'tuner' | 'flip' | 'toon' | 'spirit' | 'union' | 'gemini' | 'special';
/** モンスターの属性。 */
export type Attribute = 'dark' | 'light' | 'earth' | 'water' | 'fire' | 'wind' | 'divine';
/** 魔法・罠の種類。 */
export type SpellTrapProperty =
  | 'normal' | 'quickplay' | 'continuous' | 'equip' | 'field' | 'ritual' | 'counter';

/** 検索・条件評価に使うカードの属性とテキスト。 */
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

/** デッキ内のカードの区分。 */
export type Section = 'main' | 'extra' | 'side';
/** 各区分に入れたカードと枚数。 */
export interface DeckEntry {
  cardId: CardId;
  name: string;
  count: number;
  section: Section;
}

/** 端点を含む数値条件の範囲。 */
export type NumRange = { min?: number; max?: number };
/** カードを絞り込む単一条件。 */
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
/** AND・OR・NOT で組み合わせる条件式。 */
export type FilterNode =
  | { op: 'and' | 'or'; children: FilterNode[] }
  | { op: 'not'; child: FilterNode }
  | { op: 'pred'; pred: Predicate };

/** 条件式と手動補正で指定するカード集合。 */
export interface CardGroup {
  id: string;
  name: string;
  filter: FilterNode;
  include: CardId[];
  exclude: CardId[];
}
/** 初動スロットが必要とするカードまたはグループ。 */
export type SlotSource = { type: 'group'; groupId: string } | { type: 'card'; cardId: CardId };
/** 初動に必要な対象・枚数・種類違いの指定。 */
export interface Slot { id: string; source: SlotSource; count: number; distinctNames: boolean }
/** 同時に満たすスロットからなる初動パターン。 */
export interface Pattern { id: string; name: string; enabled: boolean; slots: Slot[] }
/** カードと初動条件をまとめた保存対象のデッキ。 */
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
/** 保存対象の全デッキとアプリ設定。 */
export interface AppState {
  schemaVersion: 1;
  decks: Deck[];
  activeDeckId: string | null;
  settings: { customHandSize: number | null };
}
/** 成功値または失敗理由を表す結果。 */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
