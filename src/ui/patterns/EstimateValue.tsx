import type { Estimate } from '../../engine/types';

export const percentFormat = new Intl.NumberFormat('ja-JP', {
  style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function EstimateValue({ estimate, prominent = false }: { estimate: Estimate; prominent?: boolean }) {
  return <span className="EstimateValue">
    <span className={prominent ? 'EstimateValue-prominent' : undefined}>{percentFormat.format(estimate.p)}</span>
    {estimate.method === 'sampling' && estimate.lo !== undefined && estimate.hi !== undefined &&
      <span className="EstimateValue-interval" aria-label="95% 信頼区間">
        （{percentFormat.format(estimate.lo).replace('%', '')}〜{percentFormat.format(estimate.hi)}）
      </span>}
  </span>;
}
