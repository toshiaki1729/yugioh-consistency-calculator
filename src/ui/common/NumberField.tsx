import { TextField } from './TextField';
import type { TextFieldProps } from './TextField';
import type { ChangeEvent } from 'react';

interface NumberFieldProps extends Omit<TextFieldProps, 'value' | 'onChange' | 'type'> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

/** 空欄または非負整数を入力する欄を表示する。 */
export function NumberField({ value, onChange, ...props }: NumberFieldProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value;
    if (text === '') onChange(undefined);
    else if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text))) onChange(Number(text));
  }
  return <TextField {...props} type="text" inputMode="numeric" pattern="[0-9]*" value={value ?? ''}
    onChange={handleChange} />;
}
