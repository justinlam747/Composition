import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface MenuItem { label: string; icon?: ReactNode; checked?: boolean; danger?: boolean; onSelect: () => void }

export default function DropdownMenu({ label, children, items, disabled, className = '' }: {
  label: string; children: ReactNode; items: MenuItem[]; disabled?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    const options = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button'));
    (options.find(option => option.getAttribute('aria-checked') === 'true') ?? options[0])?.focus();
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className={`dropdown ${className}`} ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button type="button" ref={trigger} className="dropdown-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
    }}>{children}</button>
    {open && <div ref={menu} id={id} role="menu" aria-label={label} className="dropdown-menu" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === 'Tab') { close(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const options = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button'));
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[index]?.focus();
    }}>{items.map(item => <button type="button" tabIndex={-1} key={item.label} role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked} className={item.danger ? 'danger-action' : undefined} onClick={() => { close(true); item.onSelect(); }}>{item.icon}<span>{item.label}</span>{item.checked && <span className="menu-selection" aria-hidden="true">✓</span>}</button>)}</div>}
  </div>;
}
