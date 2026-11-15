import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import './TextField.css';

/** ラベル付き入力欄の属性。 */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string }

/** ラベルと関連付けたテキスト入力欄を表示する。 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, id, ...props }, ref,
) {
  const generatedId = useId();
  return <label className="TextField" htmlFor={id ?? generatedId}>
    <span>{label}</span><input {...props} id={id ?? generatedId} ref={ref} />
  </label>;
});
