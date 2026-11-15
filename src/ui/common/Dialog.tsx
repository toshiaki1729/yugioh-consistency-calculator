import { useEffect, useId, useRef } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { IconButton } from './IconButton';
import './Dialog.css';

/** 開閉時のフォーカスを管理するモーダルを表示する。 */
export function Dialog({ open: isOpen, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement;
    const dialog = dialogRef.current!;
    dialog.showModal();
    const focusTarget = dialog.querySelector<HTMLElement>('[data-autofocus]')
      ?? dialog.querySelector<HTMLElement>('input, select, textarea, button');
    focusTarget?.focus();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [isOpen]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return <dialog ref={dialogRef} className="Dialog" aria-labelledby={titleId}
    onCancel={handleCancel}>
    <div className="Dialog-header">
      <h2 id={titleId}>{title}</h2>
      <IconButton aria-label="ダイアログを閉じる" onClick={onClose}>×</IconButton>
    </div>
    {isOpen && children}
  </dialog>;
}
