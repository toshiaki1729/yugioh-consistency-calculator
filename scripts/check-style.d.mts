/** ソース内で検出した可読性の規約違反。 */
export interface Violation {
  file: string;
  line: number;
  rule: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  message: string;
}

/** ソース文字列から可読性の規約 1〜7 の違反を行番号順に返す。 */
export function checkSource(fileName: string, text: string): Violation[];
