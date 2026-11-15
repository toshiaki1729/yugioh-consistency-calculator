import { TextField } from './TextField';
import type { TextFieldProps } from './TextField';

interface NumberFieldProps extends Omit<TextFieldProps, 'value' | 'onChange' | 'type'> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export function NumberField({ value, onChange, ...props }: NumberFieldProps) {
  return <TextField {...props} type="text" inputMode="numeric" pattern="[0-9]*" value={value ?? ''}
    onChange={event => {
      const text = event.target.value;
      if (text === '') onChange(undefined);
      else if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text))) onChange(Number(text));
    }} />;
}
