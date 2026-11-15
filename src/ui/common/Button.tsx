import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={`Button Button-${variant} ${className}`} />;
}
