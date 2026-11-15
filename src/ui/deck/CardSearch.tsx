import { useEffect, useId, useState } from 'react';
import { useCardDb } from '../../carddb/useCardDb';
import type { CardData } from '../../domain/types';
import { TextField } from '../common/TextField';
import { CardSummary } from './CardSummary';
import './CardSearch.css';

export function CardSearch({ onAdd }: { onAdd: (card: CardData) => void }) {
  const state = useCardDb();
  const db = state.status === 'ready' ? state.db : undefined;
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CardData[]>([]);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  useEffect(() => {
    const timer = setTimeout(() => {
      setMatches(db?.search(query) ?? []);
      setSearched(true);
      setActive(-1);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, db]);

  return <div className="CardSearch" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <TextField label="カードを検索" role="combobox" autoComplete="off" value={query} disabled={!db}
      aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls={listId}
      aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      onChange={event => { setQuery(event.target.value); setMatches([]); setSearched(false); setActive(-1); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { setOpen(false); setActive(-1); }
        else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length > 0) {
          event.preventDefault();
          setOpen(true);
          const next = event.key === 'ArrowDown' ? (active + 1) % matches.length : (active <= 0 ? matches.length - 1 : active - 1);
          setActive(next);
          document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' && open && matches[active]) {
          event.preventDefault();
          onAdd(matches[active]);
        }
      }} />
    {open && matches.length > 0 && <ul className="CardSearch-results" id={listId} role="listbox" aria-label="カード検索候補">
      {matches.map((card, index) => <li key={card.id} id={`${listId}-${index}`} role="option" aria-selected={active === index}
        onMouseDown={event => event.preventDefault()} onClick={() => { setActive(index); onAdd(card); }}>
        <CardSummary card={card} name={card.name} />
      </li>)}
    </ul>}
    {open && searched && query.trim() && db && matches.length === 0 && <p role="status">該当するカードがありません。</p>}
  </div>;
}
