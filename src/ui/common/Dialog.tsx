import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import './Dialog.css';

export function Dialog({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const dialog = ref.current!;
    dialog.showModal();
    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLElement>('input, select, textarea, button'))?.focus();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  return <dialog ref={ref} className="Dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="Dialog-header">
      <h2 id={titleId}>{title}</h2>
      <IconButton aria-label="ダイアログを閉じる" onClick={onClose}>×</IconButton>
    </div>
    {open && children}
  </dialog>;
}
