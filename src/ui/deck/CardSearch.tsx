import { useEffect, useId, useState } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';
import { useCardDb } from '../../carddb/useCardDb';
import type { CardData } from '../../domain/types';
import { TextField } from '../common/TextField';
import { CardSummary } from './CardSummary';
import './CardSearch.css';

const SEARCH_DELAY_MS = 150;
const NO_ACTIVE_MATCH = -1;

/** 入力を遅延検索し、キーボードでも選べるカード候補を表示する。 */
export function CardSearch({ onAdd }: { onAdd: (card: CardData) => void }) {
  const state = useCardDb();
  const database = state.status === 'ready' ? state.db : undefined;
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CardData[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(NO_ACTIVE_MATCH);
  const listId = useId();
  useEffect(() => {
    const timer = setTimeout(() => {
      setMatches(database?.search(query) ?? []);
      setHasSearched(true);
      setActive(NO_ACTIVE_MATCH);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, database]);
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
  }
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setMatches([]);
    setHasSearched(false);
    setActive(NO_ACTIVE_MATCH);
    setIsOpen(true);
  }
  function handleSelect(card: CardData, index: number) {
    setActive(index);
    onAdd(card);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActive(NO_ACTIVE_MATCH);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      let next = (active + 1) % matches.length;
      if (event.key === 'ArrowUp') next = active <= 0 ? matches.length - 1 : active - 1;
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && isOpen && matches[active]) {
      event.preventDefault();
      onAdd(matches[active]);
    }
  }
  function renderMatch(card: CardData, index: number) {
    return <SearchMatch key={card.id} card={card} index={index} listId={listId}
      isActive={active === index} onSelect={handleSelect} />;
  }
  const hasNoMatches = isOpen && hasSearched && query.trim() && database && matches.length === 0;
  return <div className="CardSearch" onBlur={handleBlur}>
    <TextField label="カードを検索" role="combobox" autoComplete="off" value={query}
      disabled={!database} aria-autocomplete="list" aria-expanded={isOpen && matches.length > 0}
      aria-controls={listId}
      aria-activedescendant={isOpen && active >= 0 ? `${listId}-${active}` : undefined}
      onChange={handleChange} onFocus={() => setIsOpen(true)} onKeyDown={handleKeyDown} />
    {isOpen && matches.length > 0 && <ul className="CardSearch-results" id={listId}
      role="listbox" aria-label="カード検索候補">
      {matches.map(renderMatch)}
    </ul>}
    {hasNoMatches && <p role="status">該当するカードがありません。</p>}
  </div>;
}

function SearchMatch({ card, index, listId, isActive, onSelect }: {
  card: CardData; index: number; listId: string; isActive: boolean;
  onSelect: (card: CardData, index: number) => void;
}) {
  return <li id={`${listId}-${index}`} role="option" aria-selected={isActive}
    onMouseDown={event => event.preventDefault()} onClick={() => onSelect(card, index)}>
    <CardSummary card={card} name={card.name} />
  </li>;
}
