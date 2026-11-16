import { useId, useState } from 'react';
import { MAX_MAIN_FILL_TARGET, MIN_MAIN_FILL_TARGET } from '../../domain/limits';
import { getMainFillCount } from '../../domain/mainFill';
import type { Deck } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Checkbox } from '../common/Checkbox';
import { NumberField } from '../common/NumberField';

const FILL_NOTE = 'メインデッキの枚数が入力した枚数より少ないとき、足りない分を初動に関係しないカードとして加えて計算します';

function isValidTarget(value: number | undefined): value is number {
  return value !== undefined && value >= MIN_MAIN_FILL_TARGET && value <= MAX_MAIN_FILL_TARGET;
}

/** 足りない分を補うかどうかと、補った後の枚数を編集する。範囲外の入力は保存しない。 */
export function MainFillSetting({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const id = useId();
  const saved = deck.mainFillTarget;
  const [draft, setDraft] = useState<{ saved: number | undefined; value: number | undefined }>({
    saved, value: saved ?? MIN_MAIN_FILL_TARGET,
  });
  // 保存値が外から変わったとき（デッキの切り替え・読み込み）は入力欄を合わせる。
  if (draft.saved !== saved) setDraft({ saved, value: saved ?? draft.value });
  const isEnabled = saved !== undefined;
  const isValid = isValidTarget(draft.value);
  const errorId = isEnabled && !isValid ? `${id}-error` : undefined;
  const mainCount = deck.entries.filter(entry => entry.section === 'main')
    .reduce((total, entry) => total + entry.count, 0);
  const fillCount = getMainFillCount(mainCount, saved);
  function handleToggle(checked: boolean) {
    const target = isValidTarget(draft.value) ? draft.value : MIN_MAIN_FILL_TARGET;
    if (checked && target !== draft.value) setDraft({ saved, value: target });
    dispatch({ type: 'deck/setMainFillTarget', target: checked ? target : null });
  }
  function handleValueChange(value: number | undefined) {
    setDraft({ saved, value });
    if (!isEnabled || !isValidTarget(value)) return;
    dispatch({ type: 'deck/setMainFillTarget', target: value });
  }
  return <div className="DeckView-fill">
    <Checkbox label="足りない分を補う" checked={isEnabled}
      onChange={event => handleToggle(event.target.checked)} />
    <NumberField label="補った後の枚数" value={draft.value} disabled={!isEnabled}
      min={MIN_MAIN_FILL_TARGET} max={MAX_MAIN_FILL_TARGET}
      aria-invalid={errorId !== undefined} aria-describedby={errorId}
      onChange={handleValueChange} />
    {errorId && <p id={errorId} className="DeckView-warning" role="status">
      {MIN_MAIN_FILL_TARGET}〜{MAX_MAIN_FILL_TARGET}{' '}の整数を入力してください（この値は保存されていません）。
    </p>}
    <p className="DeckView-note">{FILL_NOTE}</p>
    {fillCount > 0 && <p className="DeckView-note">
      計算では、初動に関係しないカードを {fillCount} 枚補って {saved} 枚にします
    </p>}
  </div>;
}
