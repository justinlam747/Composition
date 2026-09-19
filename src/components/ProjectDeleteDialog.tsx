import { useEffect, useRef, useState, type RefObject } from 'react';
import { Trash2, X } from 'lucide-react';

export default function ProjectDeleteDialog({ name, onDelete, onClose, returnFocus }: { name: string; onDelete: () => Promise<void>; onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); else returnFocus.current?.focus(); };
  }, [returnFocus]);
  return <dialog ref={dialog} className="modal project-dialog" aria-labelledby="delete-project-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button type="button" className="modal-close icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button>
    <span className="modal-symbol"><Trash2 size={23} /></span><h2 id="delete-project-title">Delete project?</h2>
    <p><strong>{name}</strong> will be removed from your projects. This cannot be undone.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button autoFocus className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button delete-project-button" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await onDelete(); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete this project. Please try again.'); setBusy(false); }
    }}>{busy ? 'Deleting…' : 'Delete project'}</button></div>
  </dialog>;
}
