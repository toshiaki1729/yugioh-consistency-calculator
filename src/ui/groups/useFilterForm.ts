import { useEffect, useRef, useState } from 'react';
import type { FilterNode } from '../../domain/types';
import { fromForm, toForm } from './filterForm';
import type { FilterForm } from './filterForm';

const FILTER_DEBOUNCE_MS = 150;

function getFilterKey(node: FilterNode): string {
  // reducer の検証でプロパティ順が変わっても、同じ値の通知として扱う。
  return JSON.stringify(node, ['op', 'children', 'child', 'pred', 'kind', 'values', 'mode',
    'range', 'min', 'max', 'text', 'includePendulum', 'cardIds']);
}

/** 未完成の条件行を保持し、確定条件の通知をデバウンスする。 */
export function useFilterForm(value: FilterNode, onChange: (node: FilterNode) => void) {
  const valueKey = getFilterKey(value);
  const [draft, setDraft] = useState(() => ({ valueKey, parsed: toForm(value) }));
  const lastEmitted = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  if (draft.valueKey !== valueKey) {
    // 自分の通知に含まれない未完成行は残し、外部からの置換だけを反映する。
    const parsed = valueKey === lastEmitted.current ? draft.parsed : toForm(value);
    setDraft({ valueKey, parsed });
  }
  useEffect(() => {
    if (valueKey === lastEmitted.current) return;
    clearTimeout(timer.current);
    lastEmitted.current = null;
  }, [valueKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function updateForm(next: FilterForm, shouldDebounce = false) {
    setDraft({ valueKey, parsed: { ok: true, value: next } });
    clearTimeout(timer.current);
    function notify() {
      const node = fromForm(next);
      lastEmitted.current = getFilterKey(node);
      onChangeRef.current(node);
    }
    if (shouldDebounce) timer.current = setTimeout(notify, FILTER_DEBOUNCE_MS);
    else notify();
  }
  return { parsed: draft.parsed, updateForm };
}
