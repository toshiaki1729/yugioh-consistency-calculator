import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

/** 用途別の見た目を指定できるボタンの属性。 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

/** 用途に応じた共通ボタンを表示する。 */
export function Button({
  variant = 'secondary', className = '', type = 'button', ...props
}: ButtonProps) {
  return <button {...props} type={type} className={`Button Button-${variant} ${className}`} />;
}
