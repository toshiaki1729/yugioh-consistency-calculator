import type { CardData } from '../../domain/types';
import type { ResolvedImport } from '../../importer/resolve';
import { Button } from '../common/Button';
import { CardSearch } from '../deck/CardSearch';

/** 未解決カードを既存カード・カスタムカード・除外のいずれかに解決する選択。 */
export type ImportChoice = { type: 'card' | 'custom'; card: CardData } | { type: 'skip' };

/** 取り込み内容の表示に使う区分名。 */
export const sectionLabels = { main: 'メイン', extra: 'エクストラ', side: 'サイド' } as const;

/** 未解決カード一件の候補選択と選び直し操作を表示する。 */
export function ImportChoiceRow({ item, choice, onChoose, onReset, onEdit }: {
  item: ResolvedImport['unresolved'][number]; choice?: ImportChoice;
  onChoose: (choice: ImportChoice) => void; onReset: () => void; onEdit: () => void;
}) {
  let choiceLabel = '';
  if (choice?.type === 'skip') choiceLabel = '取り込まない';
  else if (choice) {
    const prefix = choice.type === 'custom' ? 'カスタムカード: ' : '選択: ';
    choiceLabel = prefix + choice.card.name;
  }
  function renderCandidate(card: CardData) {
    return <CandidateButton key={card.id} card={card} onChoose={onChoose} />;
  }
  return <li aria-label={`${item.name}の解決`}>
    <p><strong>{item.name}</strong> — {sectionLabels[item.section]} {item.count} 枚</p>
    {choice ? <div className="ImportView-actions">
      <p>{choiceLabel}</p><Button onClick={onReset}>選び直す</Button>
    </div> : <>
      {item.candidates.length > 0 && <div className="ImportView-actions"
        role="group" aria-label="候補">{item.candidates.map(renderCandidate)}</div>}
      <CardSearch onAdd={card => onChoose({ type: 'card', card })} />
      <div className="ImportView-actions">
        <Button onClick={onEdit}>カスタムカードとして作る</Button>
        <Button onClick={() => onChoose({ type: 'skip' })}>取り込まない</Button>
      </div>
    </>}
  </li>;
}

function CandidateButton({ card, onChoose }: {
  card: CardData; onChoose: (choice: ImportChoice) => void;
}) {
  return <Button onClick={() => onChoose({ type: 'card', card })}>{card.name}</Button>;
}
