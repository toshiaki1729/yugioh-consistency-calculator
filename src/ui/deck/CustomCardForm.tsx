import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CardData, CardKind } from '../../domain/types';
import { cardKindLabels } from '../../domain/labels';
import { MAX_CARD_NAME_LENGTH, MAX_CARD_TEXT_LENGTH } from '../../domain/limits';
import { validateCardData } from '../../domain/validate';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { MonsterFields, SpellTrapField } from './CustomCardFields';
import './CustomCardForm.css';

interface CustomCardFormProps {
  card?: CardData;
  initialName?: string;
  importCount?: number;
  onSave: (card: CardData) => void;
  onClose: () => void;
}

/** カスタムカードを作成・編集し、検証後に保存内容を渡す。 */
export function CustomCardForm({
  card, initialName = '', importCount, onSave, onClose,
}: CustomCardFormProps) {
  const [draft, setDraft] = useState<CardData>(card ?? {
    id: 'c:draft', name: initialName, kind: 'monster', monsterTypes: [], text: '',
  });
  const [error, setError] = useState<string | null>(null);
  const isMonster = draft.kind === 'monster';
  const hasPendulumText = isMonster && draft.monsterTypes.includes('pendulum');
  const kinds = Object.entries(cardKindLabels);
  function updateDraft(changes: Partial<CardData>) { setDraft({ ...draft, ...changes }); }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = cleanCustomCard(draft);
    const checked = validateCardData(cleaned);
    if (!checked.ok) { setError(checked.error); return; }
    // 編集では非表示になった旧属性も消すため、undefined を含む変更を渡す。
    onSave(cleaned);
  }
  return <Dialog open title={card ? 'カスタムカードを編集' : 'カスタムカードを作成'} onClose={onClose}>
    <form className="CustomCardForm" onSubmit={handleSubmit}>
      <TextField label="カード名" data-autofocus value={draft.name}
        maxLength={MAX_CARD_NAME_LENGTH} required
        onChange={event => updateDraft({ name: event.target.value })} />
      {importCount !== undefined && <p>取り込み枚数: {importCount} 枚</p>}
      <Select label="カードの種類" value={draft.kind}
        onChange={event => updateDraft({
          kind: event.target.value as CardKind, property: undefined,
        })}>
        {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      {isMonster ? <MonsterFields draft={draft} onChange={updateDraft} />
        : <SpellTrapField draft={draft} onChange={updateDraft} />}
      <CardTextField label="テキスト" value={draft.text}
        onChange={text => updateDraft({ text })} />
      {hasPendulumText && <CardTextField label="ペンデュラム効果" value={draft.pendulumText ?? ''}
        onChange={pendulumText => updateDraft({ pendulumText })} />}
      {error && <p role="alert" className="CustomCardForm-error">{error}</p>}
      <div className="CustomCardForm-actions">
        <Button onClick={onClose}>キャンセル</Button>
        <Button type="submit" variant="primary" disabled={!draft.name.trim()}>保存</Button>
      </div>
    </form>
  </Dialog>;
}

function CardTextField({ label, value, onChange }: {
  label: string; value: string; onChange: (value: string) => void;
}) {
  return <label className="CustomCardForm-text">{label}<textarea rows={4}
    maxLength={MAX_CARD_TEXT_LENGTH} value={value}
    onChange={event => onChange(event.target.value)} /></label>;
}

function cleanCustomCard(draft: CardData): CardData {
  const isMonster = draft.kind === 'monster';
  const isLink = draft.monsterTypes.includes('link');
  const isXyz = draft.monsterTypes.includes('xyz');
  const isPendulum = draft.monsterTypes.includes('pendulum');
  return {
    ...draft, name: draft.name.trim(), monsterTypes: isMonster ? draft.monsterTypes : [],
    attribute: isMonster ? draft.attribute : undefined, race: isMonster ? draft.race : undefined,
    level: isMonster && !isLink && !isXyz ? draft.level : undefined,
    rank: isMonster && !isLink && isXyz ? draft.rank : undefined,
    link: isMonster && isLink ? draft.link : undefined,
    atk: isMonster ? draft.atk : undefined, def: isMonster && !isLink ? draft.def : undefined,
    scale: isMonster && isPendulum ? draft.scale : undefined,
    pendulumText: isMonster && isPendulum ? draft.pendulumText : undefined,
    property: isMonster ? undefined : draft.property,
  };
}
