import { Button } from './Button';
import type { ButtonProps } from './Button';
import './IconButton.css';

export function IconButton(props: ButtonProps & { 'aria-label': string }) {
  return <Button {...props} className={`IconButton ${props.className ?? ''}`} />;
}
