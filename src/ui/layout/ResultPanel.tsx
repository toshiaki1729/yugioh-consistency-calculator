import { useState } from 'react';
import { useAppState, useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { useCalculation } from '../patterns/CalculationProvider';
import { EstimateValue, percentFormat } from '../patterns/EstimateValue';

export function ResultPanel() {
  const { app, activeDeck } = useAppState();
  const dispatch = useDispatch();
  const calculation = useCalculation();
  const [expanded, setExpanded] = useState(false);
  const { results, stale, status, progress, error, reason } = calculation;
  const first = results?.find(result => result.handSize === 5);
  const running = status === 'running';
  const samplingInversion = results?.some(result => Object.values(result.perPattern).some(estimate =>
    (result.success.method === 'sampling' || estimate.method === 'sampling') && estimate.p > result.success.p));
  const button = <Button variant="primary" disabled={running || reason !== null}
    aria-describedby={reason ? 'calculation-reason' : undefined} onClick={calculation.run}>計算する</Button>;

  return <aside className={`result-panel${expanded ? ' result-panel-expanded' : ''}`} aria-label="計算結果">
    <div className="result-bar">
      <button type="button" className="result-toggle" aria-expanded={expanded} aria-controls="result-detail"
        aria-label={expanded ? '計算結果を折りたたむ' : '計算結果を展開する'} onClick={() => setExpanded(!expanded)}>
        <span>先攻 5 枚{stale ? '・古い結果' : ''}</span>
        <strong>{first ? percentFormat.format(first.success.p) : '未計算'}</strong>
        <span className="result-toggle-arrow" aria-hidden="true">{expanded ? '↓' : '↑'}</span>
      </button>
      {button}
    </div>
    <div id="result-detail" className="result-detail">
      <h2>計算結果</h2>
      <Select label="追加の手札枚数" value={app.settings.customHandSize ?? ''}
        onChange={event => dispatch({ type: 'settings/setCustomHandSize', handSize: event.target.value === '' ? null : Number(event.target.value) })}>
        <option value="">なし</option>
        {Array.from({ length: 10 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count} 枚</option>)}
      </Select>
      {reason && <p id="calculation-reason" className="result-warning">{reason}</p>}
      <div className="result-actions">{button}</div>
      <div role="status">
        {running && <div className="result-progress">
          <label htmlFor="calculation-progress">計算中</label>
          <progress id="calculation-progress" value={progress.done} max={progress.total || 1} />
          <Button onClick={calculation.cancel}>中止</Button>
        </div>}
        {status === 'cancelled' && <p>中止しました</p>}
        {status === 'done' && <p className="result-success">計算が完了しました</p>}
        {stale && <p className="result-warning">古い結果（再計算してください）</p>}
      </div>
      {error && <p role="alert" className="result-error">{error}</p>}
      {results ? <>
        <table className="result-table" aria-label="初動率">
          <thead><tr><th scope="col">手札</th><th scope="col">初動率</th><th scope="col">方式</th></tr></thead>
          <tbody>{results.map(result => <tr key={result.handSize}>
            <th scope="row">{result.handSize === 5 ? '先攻 5 枚' : result.handSize === 6 ? '後攻 6 枚' : `任意 ${result.handSize} 枚`}</th>
            <td><EstimateValue estimate={result.success} prominent={result.handSize === 5} /></td>
            <td>{result.success.method === 'exact' ? '厳密' : 'サンプリング'}</td>
          </tr>)}</tbody>
        </table>
        <p>計算時間 {(results.reduce((sum, result) => sum + result.elapsedMs, 0) / 1000).toFixed(2)} 秒</p>
        <h2>パターン別（先攻 5 枚）</h2>
        <ul className="result-patterns">{activeDeck?.patterns.map(pattern => <li key={pattern.id}>
          <span>{pattern.name}</span>
          <span>{!pattern.enabled ? '無効' : first?.perPattern[pattern.id]
            ? <EstimateValue estimate={first.perPattern[pattern.id]} /> : '未計算'}</span>
        </li>)}</ul>
        {samplingInversion && <p>サンプリングの誤差により、全体の値が単独パターンの値を下回ることがあります</p>}
      </> : <p>パターンを設定して「計算する」を押してください。</p>}
    </div>
  </aside>;
}
