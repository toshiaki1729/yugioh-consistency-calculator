import type { CardData } from './types';

const ruleNames = new WeakMap<CardData, string[]>();

function splitSentences(text: string): string[] {
  return text.match(/[^。\r\n]*。|[^。\r\n]+/g) ?? [];
}

function readRuleName(sentence: string): string | undefined {
  const text = sentence.trim().replace(/^(?:[①-⑳][：:]?|●|\s)+/u, '');
  const unconditional = text.match(
    /^(?:このカード名はルール上|このカードのカード名は(?:ルール上)?)「([^」]+)」として扱う。$/u,
  );
  if (unconditional) return unconditional[1];
  const located = text.match(/^このカードのカード名は、([^「」]+)に存在する限り「([^」]+)」として扱う。$/u);
  if (located && located[1].split('・').includes('手札')) return located[2];
  return undefined;
}

/** 手札で効く宣言からルール上の名前を出現順に重複なく返す。 */
export function getRuleNames(card: CardData): string[] {
  const cached = ruleNames.get(card);
  if (cached) return cached;
  const names = new Set<string>();
  for (const text of [card.text, card.pendulumText ?? '']) {
    for (const sentence of splitSentences(text)) {
      const name = readRuleName(sentence);
      if (name !== undefined) names.add(name);
    }
  }
  const result = [...names];
  ruleNames.set(card, result);
  return result;
}

/** 手札で効く名前の宣言文だけを除き、他のカード名の記述を残す。 */
export function removeRuleNameSentences(text: string): string {
  return splitSentences(text).filter(sentence => readRuleName(sentence) === undefined).join('\n');
}
