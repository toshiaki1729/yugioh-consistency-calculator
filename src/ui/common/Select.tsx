import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import './Select.css';

/** ラベルと関連付けた選択欄を表示する。 */
export function Select({ label, id, children, ...props }:
  SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  return <label className="Select" htmlFor={id ?? generatedId}>
    <span>{label}</span><select {...props} id={id ?? generatedId}>{children}</select>
  </label>;
}
