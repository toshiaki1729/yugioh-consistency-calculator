export const raceTranslations = {
  Spellcaster: '魔法使い族', Dragon: 'ドラゴン族', Zombie: 'アンデット族',
  Warrior: '戦士族', 'Beast-Warrior': '獣戦士族', Beast: '獣族',
  'Winged Beast': '鳥獣族', Fiend: '悪魔族', Fairy: '天使族', Insect: '昆虫族',
  Dinosaur: '恐竜族', Reptile: '爬虫類族', Fish: '魚族', 'Sea Serpent': '海竜族',
  Aqua: '水族', Pyro: '炎族', Thunder: '雷族', Rock: '岩石族', Plant: '植物族',
  Machine: '機械族', Psychic: 'サイキック族', 'Divine-Beast': '幻神獣族',
  Wyrm: '幻竜族', Cyberse: 'サイバース族', Illusion: '幻想魔族', 'Creator God': '創造神族',
};

const monsterTypes = new Map([
  ['Normal', 'normal'], ['Effect', 'effect'], ['Fusion', 'fusion'], ['Ritual', 'ritual'],
  ['Synchro', 'synchro'], ['Xyz', 'xyz'], ['Pendulum', 'pendulum'], ['Link', 'link'],
  ['Tuner', 'tuner'], ['Flip', 'flip'], ['Toon', 'toon'], ['Spirit', 'spirit'],
  ['Union', 'union'], ['Gemini', 'gemini'], ['Special Summon', 'special'],
]);
const kinds = new Map([['Monster', 'monster'], ['Spell', 'spell'], ['Trap', 'trap']]);
const properties = new Map([
  ['Normal', 'normal'], ['Quick-Play', 'quickplay'], ['Continuous', 'continuous'],
  ['Equip', 'equip'], ['Field', 'field'], ['Ritual', 'ritual'], ['Counter', 'counter'],
]);
const attributes = new Set(['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE']);

function stripTagsAndDecode(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return text.replace(/<[^>]*>/g, '').replace(
    /&(amp|lt|gt|quot|apos|#\d+|#[xX][\da-fA-F]+);/g,
    (match, entity) => {
      if (entity[0] !== '#') return entities[entity];
      const hex = entity[1].toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : '\uFFFD';
    },
  );
}

export function convertCard(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { skipped: 'カードがオブジェクトではありません', warnings };
  }
  if (!Number.isSafeInteger(raw.konami_id) || raw.konami_id <= 0) {
    return { skipped: 'konami_id がありません、または不正です', warnings };
  }
  if (typeof raw.name?.ja !== 'string' || !raw.name.ja.trim()) {
    return { skipped: '日本語名がありません', warnings };
  }
  const kind = kinds.get(raw.card_type);
  if (!kind) {
    warnings.push('未知の card_type');
    return { skipped: 'カードの種類を変換できません', warnings };
  }
  const name = stripTagsAndDecode(raw.name.ja.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, ''));
  if (!name.trim()) return { skipped: '日本語名が空です', warnings };
  const card = {
    id: `k${raw.konami_id}`, konamiId: raw.konami_id, name, kind, monsterTypes: [],
    text: typeof raw.text?.ja === 'string' ? raw.text.ja : '',
  };
  if (raw.text?.ja !== undefined && typeof raw.text.ja !== 'string') warnings.push('不正な text.ja');
  if (/<rt\b/i.test(raw.name.ja)) {
    card.kana = stripTagsAndDecode(raw.name.ja.replace(
      /<ruby\b[^>]*>[\s\S]*?<rt\b[^>]*>([\s\S]*?)<\/rt>[\s\S]*?<\/ruby>/gi, '$1',
    ));
  }
  if (raw.pendulum_effect?.ja !== undefined) {
    if (typeof raw.pendulum_effect.ja === 'string') card.pendulumText = raw.pendulum_effect.ja;
    else warnings.push('不正な pendulum_effect.ja');
  }
  if (kind === 'monster') {
    if (typeof raw.monster_type_line === 'string' && raw.monster_type_line.trim()) {
      const [race, ...types] = raw.monster_type_line.split('/').map((part) => part.trim());
      if (Object.hasOwn(raceTranslations, race)) card.race = raceTranslations[race];
      else {
        card.race = race;
        warnings.push('未知の種族');
      }
      for (const type of types) {
        const mapped = monsterTypes.get(type);
        if (mapped) card.monsterTypes.push(mapped);
        else warnings.push('未知のモンスターの種類');
      }
    } else warnings.push('不正な monster_type_line');
    if (attributes.has(raw.attribute)) card.attribute = raw.attribute.toLowerCase();
    else if (raw.attribute !== undefined) warnings.push('未知の attribute');
    for (const [source, target] of [
      ['level', 'level'], ['rank', 'rank'], ['pendulum_scale', 'scale'], ['atk', 'atk'], ['def', 'def'],
    ]) {
      if (target === 'def' && card.monsterTypes.includes('link')) continue;
      const value = raw[source];
      if (value === undefined) continue;
      if (Number.isSafeInteger(value) && value >= 0) card[target] = value;
      else if (value === '?' && (target === 'atk' || target === 'def')) card[target] = null;
      else warnings.push(`不正な ${source}`);
    }
    if (raw.link_arrows !== undefined) {
      if (Array.isArray(raw.link_arrows) && raw.link_arrows.every((arrow) => typeof arrow === 'string')) {
        card.link = raw.link_arrows.length;
      } else warnings.push('不正な link_arrows');
    }
  } else if (raw.property !== undefined) {
    const property = properties.get(raw.property);
    if (property) card.property = property;
    else warnings.push('未知の property');
  }
  return { card, warnings };
}

export function convertCards(rawArray, generatedAt) {
  const cards = [];
  const stats = { converted: 0, skipped: 0, warnings: 0, warningCounts: {} };
  for (const raw of rawArray) {
    const result = convertCard(raw);
    if (result.card) cards.push(result.card);
    else stats.skipped++;
    for (const warning of result.warnings) {
      stats.warnings++;
      stats.warningCounts[warning] = (stats.warningCounts[warning] ?? 0) + 1;
    }
  }
  cards.sort((a, b) => a.konamiId - b.konamiId);
  stats.converted = cards.length;
  return { db: { version: 1, source: 'yaml-yugi', generatedAt, cards }, stats };
}
