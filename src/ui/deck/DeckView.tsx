import { useEffect, useState } from 'react';
import { useCardDb, useResolveCard } from '../../carddb/useCardDb';
import type { CardData, Deck, Section } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { IconButton } from '../common/IconButton';
import { Select } from '../common/Select';
import { CardSearch } from './CardSearch';
import { CardSummary } from './CardSummary';
import { CustomCardForm } from './CustomCardForm';
import './DeckView.css';

const sections: { value: Section; label: string }[] = [
  { value: 'main', label: 'メイン' }, { value: 'extra', label: 'エクストラ' }, { value: 'side', label: 'サイド' },
];

export function DeckView({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const dbState = useCardDb();
  const resolveCard = useResolveCard();
  const [section, setSection] = useState<Section>('main');
  const [editing, setEditing] = useState<CardData | 'new' | null>(null);
  const [pendingCard, setPendingCard] = useState<{ previousIds: string[]; section: Section } | null>(null);
  const mainCount = deck.entries.filter(entry => entry.section === 'main').reduce((total, entry) => total + entry.count, 0);
  const kindOrder = { monster: 0, spell: 1, trap: 2 };
  const entries = deck.entries.map(entry => ({ entry, card: resolveCard(entry.cardId) })).sort((a, b) =>
    (a.card ? kindOrder[a.card.kind] : 3) - (b.card ? kindOrder[b.card.kind] : 3)
    || (a.card?.name ?? a.entry.name).localeCompare(b.card?.name ?? b.entry.name, 'ja'));
  useEffect(() => {
    if (!pendingCard) return;
    const card = deck.customCards.find(item => !pendingCard.previousIds.includes(item.id));
    if (card) {
      dispatch({ type: 'entry/add', cardId: card.id, name: card.name, section: pendingCard.section });
      setPendingCard(null);
    }
  }, [deck.customCards, pendingCard, dispatch]);

  return <div className="DeckView">
    <section className="DeckView-import" aria-labelledby="deck-import-heading">
      <h2 id="deck-import-heading">デッキを取り込む</h2>
      <div className="DeckView-importSlot" />
    </section>
    {dbState.status === 'loading' && <p role="status">カードDBを読み込み中…</p>}
    {dbState.status === 'error' && <div className="DeckView-dbError">
      <p role="alert">{dbState.error}</p><Button onClick={dbState.retry}>カードDBを再試行</Button>
    </div>}
    <section className="DeckView-add" aria-labelledby="deck-add-heading">
      <h2 id="deck-add-heading">カードを追加</h2>
      <Select label="追加先" value={section} onChange={event => setSection(event.target.value as Section)}>
        {sections.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </Select>
      <CardSearch onAdd={card => dispatch({ type: 'entry/add', cardId: card.id, name: card.name, section })} />
      <Button disabled={deck.customCards.length >= 200 || deck.entries.length >= 200} onClick={() => setEditing('new')}>カスタムカードを作成</Button>
    </section>
    {(mainCount < 40 || mainCount > 60) && <p className="DeckView-warning">
      {mainCount > 60 ? '計算できません（60 枚まで）' : 'メインデッキは 40〜60 枚を推奨します。'} 現在 {mainCount} 枚
    </p>}
    {deck.entries.length === 0 && <EmptyState>カードを検索して追加するか、カスタムカードを作成してください。</EmptyState>}
    {sections.map(({ value, label }) => {
      const rows = entries.filter(({ entry }) => entry.section === value);
      const count = rows.reduce((total, { entry }) => total + entry.count, 0);
      return <section key={value} className="DeckView-section" aria-labelledby={`deck-${value}-heading`}>
        <h2 id={`deck-${value}-heading`}>{label} <span>{count} 枚</span></h2>
        {rows.length === 0 ? <p className="DeckView-empty">カードがありません。</p> : <ul className="DeckView-list">
          {rows.map(({ entry, card }) => <li key={entry.cardId} className="DeckView-row" aria-label={card?.name ?? entry.name}>
            <div className="DeckView-card">
              <CardSummary card={card} name={entry.name} />
              {!card && <p className="DeckView-note">グループへ手動追加するか、初動パターンで特定のカードとして指定できます。</p>}
            </div>
            <div className="DeckView-controls">
              <div className="DeckView-count">
                <IconButton aria-label="枚数を減らす" onClick={() => dispatch(entry.count === 1
                  ? { type: 'entry/delete', cardId: entry.cardId, section: value }
                  : { type: 'entry/setCount', cardId: entry.cardId, section: value, count: entry.count - 1 })}>−</IconButton>
                <span aria-label="枚数">{entry.count}</span>
                <IconButton aria-label="枚数を増やす" disabled={entry.count >= 60}
                  onClick={() => dispatch({ type: 'entry/setCount', cardId: entry.cardId, section: value, count: entry.count + 1 })}>＋</IconButton>
              </div>
              <Select label="区分" value={value} onChange={event => dispatch({ type: 'entry/setSection', cardId: entry.cardId, section: value, newSection: event.target.value as Section })}>
                {sections.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
              {card?.custom && <Button onClick={() => setEditing(card)}>編集</Button>}
              <IconButton aria-label="カードを削除" variant="danger" onClick={() => dispatch({ type: 'entry/delete', cardId: entry.cardId, section: value })}>×</IconButton>
            </div>
          </li>)}
        </ul>}
      </section>;
    })}
    {deck.customCards.length > 0 && <section className="DeckView-section" aria-labelledby="custom-cards-heading">
      <h2 id="custom-cards-heading">登録済みカスタムカード</h2>
      <ul className="DeckView-list">{deck.customCards.map(card => <li key={card.id} className="DeckView-row">
        <CardSummary card={card} name={card.name} />
        <div className="DeckView-controls">
          <Button onClick={() => dispatch({ type: 'entry/add', cardId: card.id, name: card.name, section })}>追加</Button>
          <Button onClick={() => setEditing(card)}>編集</Button>
        </div>
      </li>)}</ul>
    </section>}
    {editing && <CustomCardForm card={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={card => {
      if (editing === 'new') {
        setPendingCard({ previousIds: deck.customCards.map(item => item.id), section });
        dispatch({ type: 'customCard/add', card });
      } else dispatch({ type: 'customCard/edit', cardId: editing.id, changes: card });
      setEditing(null);
    }} />}
  </div>;
}
