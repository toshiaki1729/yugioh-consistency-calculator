import { useState } from 'react';
import type { Attribute, CardData, CardKind, MonsterType, SpellTrapProperty } from '../../domain/types';
import { attributeLabels, cardKindLabels, monsterTypeLabels, races, spellTrapPropertyLabels } from '../../domain/labels';
import { validateCardData } from '../../domain/validate';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Dialog } from '../common/Dialog';
import { NumberField } from '../common/NumberField';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import './CustomCardForm.css';

export function CustomCardForm({ card, initialName = '', importCount, onSave, onClose }: {
  card?: CardData; initialName?: string; importCount?: number; onSave: (card: CardData) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<CardData>(card ?? { id: 'c:draft', name: initialName, kind: 'monster', monsterTypes: [], text: '' });
  const [error, setError] = useState<string | null>(null);
  const monster = draft.kind === 'monster';
  const link = draft.monsterTypes.includes('link');
  const xyz = draft.monsterTypes.includes('xyz');
  const pendulum = draft.monsterTypes.includes('pendulum');

  return <Dialog open title={card ? 'カスタムカードを編集' : 'カスタムカードを作成'} onClose={onClose}>
    <form className="CustomCardForm" onSubmit={event => {
      event.preventDefault();
      const cleaned: CardData = {
        ...draft, name: draft.name.trim(), monsterTypes: monster ? draft.monsterTypes : [],
        attribute: monster ? draft.attribute : undefined, race: monster ? draft.race : undefined,
        level: monster && !link && !xyz ? draft.level : undefined,
        rank: monster && !link && xyz ? draft.rank : undefined,
        link: monster && link ? draft.link : undefined,
        atk: monster ? draft.atk : undefined, def: monster && !link ? draft.def : undefined,
        scale: monster && pendulum ? draft.scale : undefined,
        pendulumText: monster && pendulum ? draft.pendulumText : undefined,
        property: monster ? undefined : draft.property,
      };
      const checked = validateCardData(cleaned);
      if (!checked.ok) { setError(checked.error); return; }
      // 編集では非表示になった旧属性も消すため、undefined を含む変更を渡す。
      onSave(cleaned);
    }}>
      <TextField label="カード名" data-autofocus value={draft.name} maxLength={100} required onChange={event => setDraft({ ...draft, name: event.target.value })} />
      {importCount !== undefined && <p>取り込み枚数: {importCount} 枚</p>}
      <Select label="カードの種類" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as CardKind, property: undefined })}>
        {Object.entries(cardKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      {monster ? <>
        <fieldset className="CustomCardForm-types">
          <legend>モンスターの種類</legend>
          <div className="CustomCardForm-checks">
            {(Object.entries(monsterTypeLabels) as [MonsterType, string][]).map(([value, label]) =>
              <Checkbox key={value} label={label} checked={draft.monsterTypes.includes(value)} onChange={event => {
                const types = event.target.checked ? [...draft.monsterTypes, value] : draft.monsterTypes.filter(type => type !== value);
                setDraft({ ...draft, monsterTypes: types });
              }} />)}
          </div>
        </fieldset>
        <div className="CustomCardForm-grid">
          <Select label="属性" value={draft.attribute ?? ''} onChange={event => setDraft({ ...draft, attribute: event.target.value as Attribute || undefined })}>
            <option value="">未指定</option>
            {Object.entries(attributeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select label="種族" value={draft.race ?? ''} onChange={event => setDraft({ ...draft, race: event.target.value || undefined })}>
            <option value="">未指定</option>
            {draft.race && !races.some(race => race === draft.race) && <option value={draft.race}>{draft.race}</option>}
            {races.map(race => <option key={race} value={race}>{race}</option>)}
          </Select>
          {link
            ? <NumberField label="リンク" value={draft.link} onChange={value => setDraft({ ...draft, link: value })} />
            : xyz
              ? <NumberField label="ランク" value={draft.rank} onChange={value => setDraft({ ...draft, rank: value })} />
              : <NumberField label="レベル" value={draft.level} onChange={value => setDraft({ ...draft, level: value })} />}
          {pendulum && <NumberField label="Pスケール" value={draft.scale} onChange={value => setDraft({ ...draft, scale: value })} />}
          {(['atk', 'def'] as const).filter(key => key !== 'def' || !link).map(key => <div className="CustomCardForm-stat" key={key}>
            <NumberField label={key === 'atk' ? '攻撃力' : '守備力'} value={draft[key] ?? undefined} disabled={draft[key] === null}
              onChange={value => setDraft({ ...draft, [key]: value })} />
            <Checkbox label={`${key === 'atk' ? '攻撃力' : '守備力'}を ? にする`} checked={draft[key] === null}
              onChange={event => setDraft({ ...draft, [key]: event.target.checked ? null : undefined })} />
          </div>)}
        </div>
      </> : <Select label="魔法罠の種類" value={draft.property ?? ''} onChange={event => setDraft({ ...draft, property: event.target.value as SpellTrapProperty || undefined })}>
        <option value="">未指定</option>
        {Object.entries(spellTrapPropertyLabels).filter(([value]) => draft.kind === 'spell' ? value !== 'counter' : ['normal', 'continuous', 'counter'].includes(value))
          .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>}
      <label className="CustomCardForm-text">テキスト<textarea rows={4} maxLength={5000} value={draft.text} onChange={event => setDraft({ ...draft, text: event.target.value })} /></label>
      {monster && pendulum && <label className="CustomCardForm-text">ペンデュラム効果<textarea rows={4} maxLength={5000} value={draft.pendulumText ?? ''}
        onChange={event => setDraft({ ...draft, pendulumText: event.target.value })} /></label>}
      {error && <p role="alert" className="CustomCardForm-error">{error}</p>}
      <div className="CustomCardForm-actions">
        <Button onClick={onClose}>キャンセル</Button>
        <Button type="submit" variant="primary" disabled={!draft.name.trim()}>保存</Button>
      </div>
    </form>
  </Dialog>;
}
