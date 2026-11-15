import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { MAX_HAND_SIZE, MIN_HAND_SIZE } from '../../domain/limits';
import { useAppState, useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { useCalculation } from '../patterns/CalculationProvider';
import { percentFormat } from '../patterns/EstimateValue';
import { CalculationResults, FIRST_HAND_SIZE } from './CalculationResults';

/** 計算操作・進捗と折りたたみ可能な結果パネルを表示する。 */
export function ResultPanel() {
  const calculation = useCalculation();
  const [isExpanded, setIsExpanded] = useState(false);
  const { results, stale: isStale, status, progress, error, reason } = calculation;
  const first = results?.find(result => result.handSize === FIRST_HAND_SIZE);
  const isRunning = status === 'running';
  const button = <Button variant="primary" disabled={isRunning || reason !== null}
    aria-describedby={reason ? 'calculation-reason' : undefined} onClick={calculation.run}>
    計算する
  </Button>;
  return <aside className={`result-panel${isExpanded ? ' result-panel-expanded' : ''}`}
    aria-label="計算結果">
    <div className="result-bar">
      <button type="button" className="result-toggle" aria-expanded={isExpanded}
        aria-controls="result-detail"
        aria-label={isExpanded ? '計算結果を折りたたむ' : '計算結果を展開する'}
        onClick={() => setIsExpanded(!isExpanded)}>
        <span>先攻 5 枚{isStale ? '・古い結果' : ''}</span>
        <strong>{first ? percentFormat.format(first.success.p) : '未計算'}</strong>
        <span className="result-toggle-arrow" aria-hidden="true">{isExpanded ? '↓' : '↑'}</span>
      </button>
      {button}
    </div>
    <div id="result-detail" className="result-detail">
      <h2>計算結果</h2>
      <HandSizeSelect />
      {reason && <p id="calculation-reason" className="result-warning">{reason}</p>}
      <div className="result-actions">{button}</div>
      <div role="status">
        {isRunning && <div className="result-progress">
          <label htmlFor="calculation-progress">計算中</label>
          <progress id="calculation-progress" value={progress.done} max={progress.total || 1} />
          <Button onClick={calculation.cancel}>中止</Button>
        </div>}
        {status === 'cancelled' && <p>中止しました</p>}
        {status === 'done' && <p className="result-success">計算が完了しました</p>}
        {isStale && <p className="result-warning">古い結果（再計算してください）</p>}
      </div>
      {error && <p role="alert" className="result-error">{error}</p>}
      {results ? <CalculationResults results={results} />
        : <p>パターンを設定して「計算する」を押してください。</p>}
    </div>
  </aside>;
}

function HandSizeSelect() {
  const { app } = useAppState();
  const dispatch = useDispatch();
  const handSizes = Array.from(
    { length: MAX_HAND_SIZE - MIN_HAND_SIZE + 1 }, (_, index) => index + MIN_HAND_SIZE,
  );
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const handSize = event.target.value === '' ? null : Number(event.target.value);
    dispatch({ type: 'settings/setCustomHandSize', handSize });
  }
  return <Select label="追加の手札枚数" value={app.settings.customHandSize ?? ''}
    onChange={handleChange}>
    <option value="">なし</option>
    {handSizes.map(count => <option key={count} value={count}>{count} 枚</option>)}
  </Select>;
}
