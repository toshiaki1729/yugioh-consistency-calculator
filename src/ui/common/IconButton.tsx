import { Button } from './Button';
import type { ButtonProps } from './Button';
import './IconButton.css';

/** 読み上げ用ラベルを持つアイコンボタンを表示する。 */
export function IconButton(props: ButtonProps & { 'aria-label': string }) {
  return <Button {...props} className={`IconButton ${props.className ?? ''}`} />;
}
