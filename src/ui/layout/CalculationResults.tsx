import type { Estimate, HandResult } from '../../engine/types';
import type { Pattern } from '../../domain/types';
import { useAppState } from '../../state/store';
import { EstimateValue } from '../patterns/EstimateValue';

/** 結果を強調表示する先攻の手札枚数。 */
export const FIRST_HAND_SIZE = 5;
const SECOND_HAND_SIZE = 6;
const MILLISECONDS_PER_SECOND = 1000;
const ELAPSED_DECIMAL_PLACES = 2;

/** 全体・パターン別の確率と計算時間を表示する。 */
export function CalculationResults({ results }: { results: HandResult[] }) {
  const { activeDeck } = useAppState();
  const first = results.find(result => result.handSize === FIRST_HAND_SIZE);
  const hasSamplingInversion = results.some(result =>
    Object.values(result.perPattern).some(estimate =>
      (result.success.method === 'sampling' || estimate.method === 'sampling')
      && estimate.p > result.success.p));
  const elapsedSeconds = (results.reduce((sum, result) => sum + result.elapsedMs, 0)
    / MILLISECONDS_PER_SECOND).toFixed(ELAPSED_DECIMAL_PLACES);
  function renderPattern(pattern: Pattern) {
    return <PatternResult key={pattern.id} pattern={pattern}
      estimate={first && Object.hasOwn(first.perPattern, pattern.id)
        ? first.perPattern[pattern.id] : undefined} />;
  }
  return <>
    <table className="result-table" aria-label="初動率">
      <thead><tr><th scope="col">手札</th><th scope="col">初動率</th><th scope="col">方式</th></tr></thead>
      <tbody>
        {results.map(result => <HandResultRow key={result.handSize} result={result} />)}
      </tbody>
    </table>
    <p>計算時間 {elapsedSeconds} 秒</p>
    <h2>パターン別（先攻 5 枚）</h2>
    <ul className="result-patterns">{activeDeck?.patterns.map(renderPattern)}</ul>
    {hasSamplingInversion && <p>サンプリングの誤差により、全体の値が単独パターンの値を下回ることがあります。</p>}
  </>;
}

function HandResultRow({ result }: { result: HandResult }) {
  let label = `任意 ${result.handSize} 枚`;
  if (result.handSize === FIRST_HAND_SIZE) label = '先攻 5 枚';
  else if (result.handSize === SECOND_HAND_SIZE) label = '後攻 6 枚';
  return <tr>
    <th scope="row">{label}</th>
    <td>
      <EstimateValue estimate={result.success} prominent={result.handSize === FIRST_HAND_SIZE} />
    </td>
    <td>{result.success.method === 'exact' ? '厳密' : 'サンプリング'}</td>
  </tr>;
}

function PatternResult({ pattern, estimate }: { pattern: Pattern; estimate?: Estimate }) {
  let value = <>未計算</>;
  if (!pattern.enabled) value = <>無効</>;
  else if (estimate) value = <EstimateValue estimate={estimate} />;
  return <li><span>{pattern.name}</span><span>{value}</span></li>;
}
