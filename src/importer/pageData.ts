import { attributeLabels, monsterTypeLabels } from '../domain/labels';
import type { Attribute, CardData, MonsterType } from '../domain/types';
import type { ImportDetail } from './payload';

export function buildCardFromDetail(cid: number, name: string, detail: ImportDetail): CardData | null {
  const attr = detail.attr?.normalize('NFKC').trim();
  const attribute = (Object.keys(attributeLabels) as Attribute[]).find(key => `${attributeLabels[key]}属性` === attr);
  const species = (detail.species ?? '').normalize('NFKC').replace(/[【】]/g, '').split('/').map(part => part.trim());
  const race = species.find(part => part.endsWith('族') && part.length <= 100);
  const monsterTypes = (Object.keys(monsterTypeLabels) as MonsterType[]).filter(key => species.includes(monsterTypeLabels[key]));
  const levelRank = detail.levelRank?.normalize('NFKC').trim().match(/^(レベル|ランク|リンク)\s*(\d+)$/);
  const kind = attr === '魔法' ? 'spell' : attr === '罠' ? 'trap'
    : attribute || race || monsterTypes.length || levelRank ? 'monster' : null;
  if (!kind) return null;
  const card: CardData = { id: `k${cid}`, konamiId: cid, name, kind, monsterTypes: [], text: detail.text ?? '' };
  if (kind !== 'monster') return card;
  card.monsterTypes = monsterTypes;
  if (attribute) card.attribute = attribute;
  if (race) card.race = race;
  if (levelRank && Number(levelRank[2]) <= 99999) {
    const key = levelRank[1] === 'レベル' ? 'level' : levelRank[1] === 'ランク' ? 'rank' : 'link';
    card[key] = Number(levelRank[2]);
  }
  for (const key of ['atk', 'def'] as const) {
    if (key === 'def' && (card.link !== undefined || monsterTypes.includes('link'))) continue;
    const label = key === 'atk' ? '攻撃力' : '守備力';
    const match = detail[key]?.normalize('NFKC').trim().match(new RegExp(`^(?:${label}\\s*)?(\\d+|\\?)$`));
    if (match?.[1] === '?') card[key] = null;
    else if (match && Number(match[1]) <= 99999) card[key] = Number(match[1]);
  }
  return card;
}
