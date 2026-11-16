import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useCardDb, useResolveCard } from '../../carddb/useCardDb';
import type { CardData, Deck, Section } from '../../domain/types';
import { MAX_CUSTOM_CARDS, MAX_ENTRIES, MIN_ENTRY_COUNT } from '../../domain/limits';
import { MAX_MAIN_FILL_TARGET, MIN_MAIN_FILL_TARGET } from '../../domain/limits';
import { getMainFillCount } from '../../domain/mainFill';
import { MAX_DECK_SIZE } from '../../engine/constants';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Select } from '../common/Select';
import { CardSearch } from './CardSearch';
import { CustomCardForm } from './CustomCardForm';
import { CustomCardList, DeckEntries } from './DeckEntries';
import { deckSections } from './deckSections';
import { ImportView } from '../import/ImportView';
import type { ImportPayload } from '../../importer/payload';
import './DeckView.css';

const MIN_RECOMMENDED_MAIN_COUNT = 40;
const kindOrder = { monster: 0, spell: 1, trap: 2 };
const UNKNOWN_KIND_ORDER = 3;

/** デッキへの取り込み・カード追加・区分別の編集を表示する。 */
export function DeckView({ deck, onImport }: {
  deck: Deck; onImport: (payload: ImportPayload) => void;
}) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const [section, setSection] = useState<Section>('main');
  const [editing, setEditing] = useState<CardData | 'new' | null>(null);
  const entries = deck.entries.map(entry => ({ entry, card: resolveCard(entry.cardId) }))
    .sort((left, right) =>
      (left.card ? kindOrder[left.card.kind] : UNKNOWN_KIND_ORDER)
      - (right.card ? kindOrder[right.card.kind] : UNKNOWN_KIND_ORDER)
      || (left.card?.name ?? left.entry.name)
        .localeCompare(right.card?.name ?? right.entry.name, 'ja'));
  function handleAdd(card: CardData) {
    dispatch({ type: 'entry/add', cardId: card.id, name: card.name, section });
  }
  function handleSave(card: CardData) {
    if (editing === 'new') {
      dispatch({ type: 'customCard/add', card, addToDeck: { section, count: MIN_ENTRY_COUNT } });
    } else if (editing) dispatch({ type: 'customCard/edit', cardId: editing.id, changes: card });
    setEditing(null);
  }
  function renderSection(item: typeof deckSections[number]) {
    return <DeckEntries key={item.value} section={item} entries={entries} onEdit={setEditing} />;
  }
  return <div className="DeckView">
    <DeckInput deck={deck} section={section} onSectionChange={setSection} onImport={onImport}
      onAdd={handleAdd} onCreate={() => setEditing('new')} />
    <DeckSizeWarning deck={deck} />
    <MainFillSetting deck={deck} />
    {deckSections.map(renderSection)}
    <CustomCardList cards={deck.customCards} onAdd={handleAdd} onEdit={setEditing} />
    {editing && <CustomCardForm card={editing === 'new' ? undefined : editing}
      onClose={() => setEditing(null)} onSave={handleSave} />}
  </div>;
}

function DeckInput({ deck, section, onSectionChange, onImport, onAdd, onCreate }: {
  deck: Deck; section: Section; onSectionChange: (section: Section) => void;
  onImport: (payload: ImportPayload) => void; onAdd: (card: CardData) => void; onCreate: () => void;
}) {
  const dbState = useCardDb();
  const importSection = useRef<HTMLElement>(null);
  const addSection = useRef<HTMLElement>(null);
  const isCustomLimitReached = deck.customCards.length >= MAX_CUSTOM_CARDS
    || deck.entries.length >= MAX_ENTRIES;
  function handleSearchFocus() {
    addSection.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();
  }
  return <>
    {deck.entries.length === 0 && <EmptyState>
      <p>デッキを取り込むか、カードを追加してください。</p>
      <div className="DeckView-controls">
        <Button onClick={() => importSection.current?.querySelector('textarea')?.focus()}>
          取り込み欄へ
        </Button>
        <Button disabled={dbState.status !== 'ready'} onClick={handleSearchFocus}>カード検索へ</Button>
      </div>
    </EmptyState>}
    <section ref={importSection} className="DeckView-import" aria-labelledby="deck-import-heading">
      <h2 id="deck-import-heading">デッキを取り込む</h2>
      <ImportView onImport={onImport} showDbStatus={false} />
    </section>
    {dbState.status === 'loading' && <p role="status">カードDBを読み込み中…</p>}
    {dbState.status === 'error' && <div className="DeckView-dbError">
      <p role="alert">{dbState.error}</p><Button onClick={dbState.retry}>再試行</Button>
    </div>}
    <section ref={addSection} className="DeckView-add" aria-labelledby="deck-add-heading">
      <h2 id="deck-add-heading">カードを追加</h2>
      <Select label="追加先" value={section}
        onChange={event => onSectionChange(event.target.value as Section)}>
        {deckSections.map(item =>
          <option key={item.value} value={item.value}>{item.label}</option>)}
      </Select>
      <CardSearch onAdd={onAdd} />
      <Button disabled={isCustomLimitReached} onClick={onCreate}>カスタムカードを作成</Button>
    </section>
  </>;
}

function MainFillSetting({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const mainCount = deck.entries.filter(entry => entry.section === 'main')
    .reduce((total, entry) => total + entry.count, 0);
  const fillCount = getMainFillCount(mainCount, deck.mainFillTarget);
  const targets = Array.from(
    { length: MAX_MAIN_FILL_TARGET - MIN_MAIN_FILL_TARGET + 1 },
    (_, index) => index + MIN_MAIN_FILL_TARGET,
  );
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const target = event.target.value === '' ? null : Number(event.target.value);
    dispatch({ type: 'deck/setMainFillTarget', target });
  }
  return <div>
    <div className="DeckView-controls">
      <Select label="足りない分を補う" value={deck.mainFillTarget ?? ''} onChange={handleChange}>
        <option value="">補わない</option>
        {targets.map(target => <option key={target} value={target}>{target} 枚まで</option>)}
      </Select>
    </div>
    <p className="DeckView-note">
      メインデッキが選んだ枚数より少ないとき、足りない分を初動に関係しないカードとして加えて計算します
    </p>
    {fillCount > 0 && <p className="DeckView-note">
      計算では、初動に関係しないカードを {fillCount} 枚補って {deck.mainFillTarget} 枚にします
    </p>}
  </div>;
}

function DeckSizeWarning({ deck }: { deck: Deck }) {
  const mainCount = deck.entries.filter(entry => entry.section === 'main')
    .reduce((total, entry) => total + entry.count, 0);
  if (mainCount >= MIN_RECOMMENDED_MAIN_COUNT && mainCount <= MAX_DECK_SIZE) return null;
  return <p className="DeckView-warning">
    {mainCount > MAX_DECK_SIZE
      ? '計算できません（60 枚まで）' : 'メインデッキは 40〜60 枚を推奨します。'} 現在 {mainCount} 枚
  </p>;
}
