import type { InputHTMLAttributes } from 'react';
import './Checkbox.css';

/** ラベル付きのチェックボックスを表示する。 */
export function Checkbox({ label, ...props }:
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  return <label className="Checkbox">
    <input {...props} type="checkbox" /><span>{label}</span>
  </label>;
}
