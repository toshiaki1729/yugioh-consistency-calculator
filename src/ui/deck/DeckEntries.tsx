import type { ChangeEvent } from 'react';
import type { CardData, DeckEntry, Section } from '../../domain/types';
import { MAX_ENTRY_COUNT, MIN_ENTRY_COUNT } from '../../domain/limits';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { IconButton } from '../common/IconButton';
import { Select } from '../common/Select';
import { CardSummary } from './CardSummary';
import { deckSections } from './deckSections';

interface ResolvedEntry { entry: DeckEntry; card: CardData | undefined }

/** 区分ごとの枚数と編集可能なカード一覧を表示する。 */
export function DeckEntries({ section, entries, onEdit }: {
  section: typeof deckSections[number];
  entries: ResolvedEntry[];
  onEdit: (card: CardData) => void;
}) {
  const rows = entries.filter(({ entry }) => entry.section === section.value);
  const count = rows.reduce((total, { entry }) => total + entry.count, 0);
  function renderRow({ entry, card }: ResolvedEntry) {
    return <DeckEntryRow key={entry.cardId} entry={entry} card={card} onEdit={onEdit} />;
  }
  return <section className="DeckView-section" aria-labelledby={`deck-${section.value}-heading`}>
    <h2 id={`deck-${section.value}-heading`}>{section.label} <span>{count} 枚</span></h2>
    {rows.length === 0 ? <p className="DeckView-empty">カードがありません。</p>
      : <ul className="DeckView-list">{rows.map(renderRow)}</ul>}
  </section>;
}

function DeckEntryRow({ entry, card, onEdit }: ResolvedEntry & {
  onEdit: (card: CardData) => void;
}) {
  const dispatch = useDispatch();
  const { cardId, section } = entry;
  function handleDecrease() {
    dispatch(entry.count === MIN_ENTRY_COUNT
      ? { type: 'entry/delete', cardId, section }
      : { type: 'entry/setCount', cardId, section, count: entry.count - 1 });
  }
  function handleIncrease() {
    dispatch({ type: 'entry/setCount', cardId, section, count: entry.count + 1 });
  }
  function handleSectionChange(event: ChangeEvent<HTMLSelectElement>) {
    dispatch({
      type: 'entry/setSection', cardId, section, newSection: event.target.value as Section,
    });
  }
  return <li className="DeckView-row" aria-label={card?.name ?? entry.name}>
    <div className="DeckView-card">
      <CardSummary card={card} name={entry.name} />
      {!card && <p className="DeckView-note">グループに手動で追加するか、初動パターンで特定のカードとして指定できます。</p>}
    </div>
    <div className="DeckView-controls">
      <div className="DeckView-count">
        <IconButton aria-label="枚数を減らす" onClick={handleDecrease}>−</IconButton>
        <span aria-label="枚数">{entry.count}</span>
        <IconButton aria-label="枚数を増やす" disabled={entry.count >= MAX_ENTRY_COUNT}
          onClick={handleIncrease}>＋</IconButton>
      </div>
      <Select label="区分" value={section} onChange={handleSectionChange}>
        {deckSections.map(item =>
          <option key={item.value} value={item.value}>{item.label}</option>)}
      </Select>
      {card?.custom && <Button onClick={() => onEdit(card)}>編集</Button>}
      <IconButton aria-label="カードを削除" variant="danger"
        onClick={() => dispatch({ type: 'entry/delete', cardId, section })}>×</IconButton>
    </div>
  </li>;
}

/** 登録済みカスタムカードの追加・編集操作を表示する。 */
export function CustomCardList({ cards, onAdd, onEdit }: {
  cards: CardData[]; onAdd: (card: CardData) => void; onEdit: (card: CardData) => void;
}) {
  function renderCard(card: CardData) {
    return <CustomCardRow key={card.id} card={card} onAdd={onAdd} onEdit={onEdit} />;
  }
  if (cards.length === 0) return null;
  return <section className="DeckView-section" aria-labelledby="custom-cards-heading">
    <h2 id="custom-cards-heading">登録済みカスタムカード</h2>
    <ul className="DeckView-list">{cards.map(renderCard)}</ul>
  </section>;
}

function CustomCardRow({ card, onAdd, onEdit }: {
  card: CardData; onAdd: (card: CardData) => void; onEdit: (card: CardData) => void;
}) {
  return <li className="DeckView-row">
    <CardSummary card={card} name={card.name} />
    <div className="DeckView-controls">
      <Button onClick={() => onAdd(card)}>追加</Button>
      <Button onClick={() => onEdit(card)}>編集</Button>
    </div>
  </li>;
}
