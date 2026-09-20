import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function ProjectNameDialog({ name, title, action, onSubmit, onClose }: {
  name: string; title: string; action: string; onSubmit: (name: string) => Promise<void>; onClose: () => void;
}) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal(); input.current?.select();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="modal project-dialog" aria-labelledby="project-dialog-title" onCancel={event => {
    event.preventDefault(); if (!busy) onClose();
  }}>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy || !value.trim()) return;
      setBusy(true); setError('');
      try { await onSubmit(value.trim()); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this project. Please try again.'); setBusy(false); }
    }}>
      <button type="button" className="modal-close icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button>
      <h2 id="project-dialog-title">{title}</h2>
      <label className="field-label">Project name<input ref={input} value={value} maxLength={120} required disabled={busy} onChange={event => setValue(event.target.value)} placeholder="Untitled take" /></label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !value.trim()}>{busy ? 'Saving…' : action}</button></div>
    </form>
  </dialog>;
}
