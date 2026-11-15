import type { Estimate } from '../../engine/types';

const PERCENT_FRACTION_DIGITS = 2;

/** 初動率を小数第2位までの日本語パーセント表記にする。 */
export const percentFormat = new Intl.NumberFormat('ja-JP', {
  style: 'percent', minimumFractionDigits: PERCENT_FRACTION_DIGITS,
  maximumFractionDigits: PERCENT_FRACTION_DIGITS,
});

/** 初動率とサンプリング時の95%信頼区間を表示する。 */
export function EstimateValue({ estimate, prominent = false }: {
  estimate: Estimate; prominent?: boolean;
}) {
  const className = prominent ? 'EstimateValue-prominent' : undefined;
  return <span className="EstimateValue">
    <span className={className}>{percentFormat.format(estimate.p)}</span>
    {estimate.method === 'sampling' && estimate.lo !== undefined && estimate.hi !== undefined &&
      <span className="EstimateValue-interval" aria-label="95% 信頼区間">
        （{percentFormat.format(estimate.lo).replace('%', '')}〜{percentFormat.format(estimate.hi)}）
      </span>}
  </span>;
}
