import { attributeLabels, monsterTypeLabels } from '../domain/labels';
import { MAX_NUMERIC_VALUE, MAX_RACE_LENGTH } from '../domain/limits';
import type { Attribute, CardData, MonsterType } from '../domain/types';
import type { ImportDetail } from './payload';

/** 公式ページの詳細表示から補助カードデータを作る。 */
export function buildCardFromDetail(
  cid: number, name: string, detail: ImportDetail,
): CardData | null {
  const attributeText = detail.attr?.normalize('NFKC').trim();
  const attributes = Object.keys(attributeLabels) as Attribute[];
  const attribute = attributes.find(key => `${attributeLabels[key]}属性` === attributeText);
  const speciesText = (detail.species ?? '').normalize('NFKC').replace(/[【】]/g, '');
  const species = speciesText.split('/').map(part => part.trim());
  const race = species.find(part => part.endsWith('族') && part.length <= MAX_RACE_LENGTH);
  const types = Object.keys(monsterTypeLabels) as MonsterType[];
  const monsterTypes = types.filter(key => species.includes(monsterTypeLabels[key]));
  const levelRank = detail.levelRank?.normalize('NFKC').trim().match(/^(レベル|ランク|リンク)\s*(\d+)$/);
  let kind: CardData['kind'] | null = null;
  if (attributeText === '魔法') kind = 'spell';
  else if (attributeText === '罠') kind = 'trap';
  else if (attribute || race || monsterTypes.length || levelRank) kind = 'monster';
  if (!kind) return null;
  const card: CardData = {
    id: `k${cid}`, konamiId: cid, name, kind, monsterTypes: [], text: detail.text ?? '',
  };
  if (kind !== 'monster') return card;
  card.monsterTypes = monsterTypes;
  if (attribute) card.attribute = attribute;
  if (race) card.race = race;
  if (levelRank && Number(levelRank[2]) <= MAX_NUMERIC_VALUE) {
    let key: 'level' | 'rank' | 'link' = 'link';
    if (levelRank[1] === 'レベル') key = 'level';
    else if (levelRank[1] === 'ランク') key = 'rank';
    card[key] = Number(levelRank[2]);
  }
  for (const key of ['atk', 'def'] as const) {
    if (key === 'def' && (card.link !== undefined || monsterTypes.includes('link'))) continue;
    const label = key === 'atk' ? '攻撃力' : '守備力';
    const valueText = detail[key]?.normalize('NFKC').trim();
    const match = valueText?.match(new RegExp(`^(?:${label}\\s*)?(\\d+|\\?)$`));
    if (match?.[1] === '?') card[key] = null;
    else if (match && Number(match[1]) <= MAX_NUMERIC_VALUE) card[key] = Number(match[1]);
  }
  return card;
}
