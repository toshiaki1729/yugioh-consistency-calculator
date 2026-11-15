import { useMemo } from 'react';
import { useCardDb } from '../../carddb/useCardDb';
import type { ImportPayload } from '../../importer/payload';
import { resolveImport } from '../../importer/resolve';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';
import { ImportChoices } from './ImportChoices';
import './ImportView.css';

/** DBの読み込みを待ち、取り込み内容の確認ダイアログを表示する。 */
export function ImportDialog({ payload, onClose, onImported }: {
  payload: ImportPayload; onClose: () => void; onImported: () => void;
}) {
  const state = useCardDb();
  const database = state.status === 'ready' ? state.db : undefined;
  const resolved = useMemo(() =>
    database ? resolveImport(payload, database) : null, [payload, database]);
  return <Dialog open title="デッキを取り込む" onClose={onClose}>
    {state.status === 'loading' && <p role="status">カードDBを読み込み中…</p>}
    {state.status === 'error' && <div>
      <p role="alert">{state.error}</p><Button onClick={state.retry}>再試行</Button>
    </div>}
    {resolved && <ImportChoices resolved={resolved} deckName={payload.deckName ?? '取り込んだデッキ'}
      onClose={onClose} onImported={onImported} />}
  </Dialog>;
}
