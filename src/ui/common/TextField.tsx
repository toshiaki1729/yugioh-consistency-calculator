import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import './TextField.css';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string }

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, id, ...props }, ref) {
  const generatedId = useId();
  return <label className="TextField" htmlFor={id ?? generatedId}>
    <span>{label}</span><input {...props} id={id ?? generatedId} ref={ref} />
  </label>;
});
