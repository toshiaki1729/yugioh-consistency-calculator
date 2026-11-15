import type { ChangeEvent } from 'react';
import { Checkbox } from '../common/Checkbox';

interface ChoiceFieldsProps<T extends string> {
  options: [T, string][];
  values: T[];
  onChange: (values: T[]) => void;
  errorId?: string;
}

function ChoiceField<T extends string>({ value, label, values, onChange, errorId }: {
  value: T; label: string;
} & Omit<ChoiceFieldsProps<T>, 'options'>) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.checked ? [...values, value] : values.filter(item => item !== value);
    onChange(next);
  }
  return <Checkbox label={label} checked={values.includes(value)}
    aria-describedby={errorId} aria-invalid={!!errorId} onChange={handleChange} />;
}

/** 条件で許可する複数の値をチェックボックスで選ぶ。 */
export function ChoiceFields<T extends string>({ options, ...props }: ChoiceFieldsProps<T>) {
  return <div className="FilterBuilder-checks">
    {options.map(([value, label]) =>
      <ChoiceField key={value} value={value} label={label} {...props} />)}
  </div>;
}
