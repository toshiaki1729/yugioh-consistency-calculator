import type { ReactNode } from 'react';
import './EmptyState.css';

/** 次の操作を案内する空状態を表示する。 */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="EmptyState">{children}</div>;
}
