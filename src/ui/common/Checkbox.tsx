import type { InputHTMLAttributes } from 'react';
import './Checkbox.css';

export function Checkbox({ label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  return <label className="Checkbox"><input {...props} type="checkbox" /><span>{label}</span></label>;
}
