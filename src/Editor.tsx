import { useEffect, useRef, useState } from 'react';
import { Bone, Check, Diamond, Download, Eye, Film, FolderOpen, HelpCircle, Mic, MoreHorizontal, Pencil, Redo2, RotateCcw, Save, Shapes, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { importProject, openSavedProject, saveCurrentProject } from './core/projectSession';
import ProjectNameDialog from './components/ProjectNameDialog';
import { CAMERA_ID, hasCharacter, hasTarget } from './core/project';
import AIPanel from './components/AIPanel';
import AnimationsPanel from './components/AnimationsPanel';
import ObjectsPanel from './components/ObjectsPanel';
import ProjectsPanel from './components/ProjectsPanel';
import { studio, useStudio } from './core/store';
import Viewport from './scene/Viewport';
import TimelinePanel from './components/TimelinePanel';
import Inspector from './components/Inspector';

type Panel = 'scene' | 'animate';
function saveFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Editor({ onHome, onOutput, active = true }: { onHome: () => void; onOutput: () => void; active?: boolean }) {
  const s = useStudio();
  const [panel, setPanel] = useState<Panel>('scene');
  useEffect(() => { if (s.project.clips?.length) setPanel('animate'); }, [s.project.clips?.length]);
  const [sidePanel, setSidePanel] = useState<'ai' | 'animations' | 'objects' | 'projects' | null>(null);
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState(false);
  async function save(goHome = false) {
    if (saving) return;
    setSaving(true); studio.patch({ playing: false });
    try { await saveCurrentProject(); if (goHome) onHome(); }
    catch (error) { studio.patch({ status: `Could not save project. ${(error as Error).message}` }); }
    finally { setSaving(false); setMenu(false); }
  }
  function toggleSide(panel: typeof sidePanel) { setSidePanel(current => current === panel ? null : panel); studio.patch({ preview: null, playing: false }); setMenu(false); }
  const selectedObject = hasTarget(s.project, s.objectId);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const modalClose = useRef<HTMLButtonElement>(null);
  const dialogOpen = help || confirmClear;
  function toggleDemo() {
    if (s.project.demo) studio.disableDemo();
    else { studio.demo(); setPanel('animate'); }
  }
  function choosePanel(next: Panel) { setPanel(next); setMenu(false); }

  useEffect(() => {
    if (s.status.startsWith('Ready.') || s.status.startsWith('Key saved')) return;
    setNotice(s.status);
    const timer = setTimeout(() => setNotice(''), 3400);
    return () => clearTimeout(timer);
  }, [s.status]);
  useEffect(() => {
    if (!menu) return;
    function dismiss(e: PointerEvent) { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') { setMenu(false); menuButton.current?.focus(); } }
    document.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape); };
  }, [menu]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if (!active || saving || naming || studio.get().phoneControl || studio.get().exporting || studio.get().camera === 'ar' || dialogOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); void save(); return; }
      if (e.code === 'Space' && !menu && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.isContentEditable || target.closest('input:not([type="range"]),textarea,select,[role="textbox"],dialog,[role="dialog"]')) return;
        e.preventDefault();
        if (!e.repeat) studio.togglePlay();
        return;
      }
      if ((e.target as HTMLElement).closest('input,textarea,select,option') || menu) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? studio.redo() : studio.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); studio.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyK') { studio.get().timelineMode === 'velocity' && panel === 'animate' ? studio.addVelocityKey() : studio.addKey(); }
      if (e.code === 'KeyF') studio.patch({ frameRequest: studio.get().frameRequest + 1 });
      if (e.code === 'KeyG') studio.setMode('translate');
      if (e.code === 'KeyR') studio.setMode('rotate');
      if (e.code === 'KeyS' && studio.get().camera !== 'shot') studio.setMode('scale');
      if ((e.code === 'Delete' || e.code === 'Backspace') && panel === 'animate' && studio.get().timelineMode === 'velocity') { e.preventDefault(); studio.deleteVelocityKey(); return; }
      if ((e.code === 'Delete' || e.code === 'Backspace') && studio.get().selectedKey) { e.preventDefault(); studio.deleteKey(); return; }
      if ((e.code === 'Delete' || e.code === 'Backspace') && studio.get().selectedClip) { e.preventDefault(); studio.deleteClip(); return; }
      if ((e.code === 'Delete' || e.code === 'Backspace') && !studio.get().selectedKey && studio.get().selectionActive) { e.preventDefault(); studio.removeObject(); }
      if (e.code === 'Escape') studio.patch({ selectionActive: false, preview: null });
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [active, dialogOpen, menu, saving, naming, panel]);
  useEffect(() => {
    if (!dialogOpen) return;
    studio.patch({ playing: false });
    const previous = document.activeElement as HTMLElement | null;
    modalClose.current?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key === 'Escape') { setHelp(false); setConfirmClear(false); }
      if (e.key !== 'Tab') return;
      const items = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button'));
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    }
    window.addEventListener('keydown', trap);
    return () => { window.removeEventListener('keydown', trap); previous?.focus(); };
  }, [dialogOpen]);

  return <div className="app-shell">
    <header className="app-header" inert={saving || s.phoneControl || s.exporting || s.camera === 'ar'}>
      <button className="brand" aria-label="Back to projects" title="Save and return to projects" onClick={() => void save(true)}><span className="brand-mark"><Shapes size={23} strokeWidth={1.6} /></span><span>composition</span></button>
      <nav className="editor-modes" aria-label="Editor modes">
        <button className="icon-button" aria-label="Objects" title="Objects" aria-pressed={sidePanel === 'objects'} onClick={() => toggleSide('objects')}><Shapes size={19} /></button>
        <button className="icon-button" aria-label="Scene" title="Scene" aria-pressed={panel === 'scene'} onClick={() => choosePanel('scene')}><Eye size={19} /></button>
        <button className="icon-button" aria-label="Animate" title="Animate" aria-pressed={panel === 'animate'} onClick={() => choosePanel('animate')} disabled={!s.project.camera && !s.project.objects.some(o => !o.hidden)}><Film size={19} /></button>
        <button className="icon-button" aria-label="Save current project" title="Save project (Ctrl+S)" onClick={() => void save()}><Save size={18} /></button>
      </nav>
      <div className="header-actions">
        <button className={`icon-button ${sidePanel === 'animations' ? 'is-on' : ''}`} aria-label="Animations" title="Animation library" aria-expanded={sidePanel === 'animations'} aria-controls="animations-panel" onClick={() => { toggleSide('animations'); setPanel('animate'); }}><FolderOpen size={19} /></button>
        <button className="icon-button" aria-label="Add model" title="Add a model with voice" onClick={() => toggleSide('objects')}><Mic size={18} /></button>
        <div className="menu-wrap" ref={menuRef}>
          <button ref={menuButton} className={`icon-button ${menu ? 'is-on' : ''}`} aria-label="Scene menu" aria-expanded={menu} aria-controls="scene-menu" onClick={() => setMenu(!menu)}><MoreHorizontal size={22} /></button>
          {menu && <div id="scene-menu" className="scene-menu">
            <button className="project-name-action" onClick={() => { setMenu(false); setNaming(true); }} aria-label="Rename project"><Pencil size={16} /><span>{s.project.name}</span></button>
            <div className="menu-separator" />
            <button onClick={() => { setMenu(false); onOutput(); }}><Film size={16} /> Output</button>
            <button disabled={!s.undoCount} onClick={() => { studio.undo(); setMenu(false); }}><Undo2 size={16} /> Undo</button>
            <button disabled={!s.redoCount} onClick={() => { studio.redo(); setMenu(false); }}><Redo2 size={16} /> Redo</button>
            <button onClick={() => toggleSide('ai')}><Sparkles size={16} /> Regenerate</button>
            <div className="menu-separator" />
            <button role="switch" aria-label="Demo mode" aria-checked={s.project.demo} onClick={toggleDemo}><Sparkles size={16} /> Demo mode <span className={`menu-toggle ${s.project.demo ? 'is-checked' : ''}`} aria-hidden="true"><span /></span></button>
            <div className="menu-separator" />
            <button disabled={saving} onClick={() => void save()}><Save size={16} />{saving ? 'Saving project...' : 'Save project'}</button>
            <button onClick={() => void save(true)}><FolderOpen size={16} />All projects</button>
            <button onClick={() => toggleSide('projects')}><FolderOpen size={16} />Open saved project</button>
            <button onClick={() => { fileInput.current?.click(); setMenu(false); }}><FolderOpen size={16} /> Open scene</button>
            <button onClick={() => { saveFile(`${s.project.name.replace(/[^a-z0-9_-]/gi, '-') || 'scene'}.json`, JSON.stringify(s.project, null, 2)); setMenu(false); studio.patch({ status: 'Scene saved to a JSON file.' }); }}><Download size={16} /> Save scene</button>
            <div className="menu-separator" />
            <button onClick={() => studio.patch({ showRig: !s.showRig })}><Bone size={16} /> Show skeleton {s.showRig && <Check className="menu-check" size={14} />}</button>
            <button onClick={() => studio.patch({ showGrid: !s.showGrid })}><Shapes size={16} /> Show grid {s.showGrid && <Check className="menu-check" size={14} />}</button>
            <div className="menu-separator" />
            <button disabled={!s.project.tracks.some(t => t.keys.length) && !s.project.clips?.length} onClick={() => { setMenu(false); setConfirmClear(true); }}><RotateCcw size={16} /> Clear motion</button>
            <button disabled={!hasCharacter(s.project)} onClick={() => { studio.remove(); setMenu(false); setPanel('scene'); }}><Trash2 size={16} /> Remove character</button>
            <button onClick={() => { setMenu(false); setHelp(true); }}><HelpCircle size={16} /> Help & shortcuts</button>
          </div>}
        </div>
      </div>
      <input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="Import scene JSON" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        setSaving(true); studio.patch({ playing: false });
        try { if (file.size > 8_000_000) throw new Error('Scene files must be smaller than 8 MB.'); await importProject(await file.text()); }
        catch (error) { studio.patch({ status: error instanceof Error ? error.message : 'Could not load this scene.' }); }
        finally { setSaving(false); e.target.value = ''; }
      }} />
    </header>
    <div className={`workspace ${sidePanel ? 'with-panel' : ''}`} inert={saving || s.exporting || s.camera === 'ar'}>
    <main inert={s.phoneControl} className={`editor-main panel-${panel}${s.selectionActive && selectedObject && !s.playing && !s.preview ? ' has-selection' : ''}`}>
      <div className="stage-area"><Viewport active={active} />
        {s.preview && <div className="preview-banner">Suggestion preview · not applied</div>}
        {s.selectionActive && selectedObject && s.objectId !== CAMERA_ID && !s.playing && !s.preview && <Inspector onClose={() => studio.patch({ selectionActive: false })} />}
        {notice && <div className="notice"><Check size={15} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={14} /></button></div>}
      </div>
      {panel === 'animate' && <TimelinePanel />}
    </main>
    {sidePanel === 'ai' && <AIPanel onClose={() => setSidePanel(null)} />}
    {sidePanel === 'animations' && <AnimationsPanel onClose={() => setSidePanel(null)} />}
    {sidePanel === 'objects' && <ObjectsPanel onClose={() => setSidePanel(null)} />}
    {sidePanel === 'projects' && <ProjectsPanel onClose={() => setSidePanel(null)} onOpen={async id => {
      setSaving(true); studio.patch({ playing: false });
      try { await openSavedProject(id); setSidePanel(null); }
      finally { setSaving(false); }
    }} />}
    </div>
    {saving && <div className="project-saving" role="status">Saving project…</div>}
    {naming && <ProjectNameDialog name={s.project.name} title="Rename project" action="Save name" onClose={() => setNaming(false)} onSubmit={async name => { studio.rename(name); await saveCurrentProject(); }} />}
    {s.exporting && <div className="capture-overlay" role="status"><Film size={24} /><strong>Recording clean guide…</strong><span>{s.time.toFixed(1)} / {s.project.duration} s · Export pauses if this tab is hidden</span></div>}
    <span className="status-message sr-only" role="status" aria-live="polite">{s.status}</span>
    {dialogOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setHelp(false); setConfirmClear(false); } }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
        <button ref={modalClose} className="modal-close icon-button" aria-label="Close dialog" onClick={() => { setHelp(false); setConfirmClear(false); }}><X size={20} /></button>
        {confirmClear ? <><span className="modal-symbol"><RotateCcw size={23} /></span><h2 id="modal-heading">Clear the motion?</h2><p>All keyframes will be removed and the character will return to its starting pose. You can undo this.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setConfirmClear(false)}>Keep editing</button><button className="button primary" onClick={() => { studio.clear(); setConfirmClear(false); }}>Clear all motion</button></div></> : <>
          <span className="modal-symbol"><Diamond size={23} /></span><h2 id="modal-heading">A few simple moves.</h2>
          <ol><li>In <strong>Scene</strong>, click a body part to highlight it and open its controls. Click empty space to close them.</li><li>Drag the handles or enter values to pose the character. Edits save a key at the current time.</li><li><strong>Animate</strong> lets you play, scrub and retime those keys.</li><li>Turn on <strong>Demo mode</strong> in the three-dot menu to load a prepared idle. Turning it off keeps your existing keys.</li></ol>
          <div className="shortcut-grid"><span><kbd>G</kbd> Move</span><span><kbd>R</kbd> Rotate</span><span><kbd>S</kbd> Scale</span><span><kbd>K</kbd> Add key</span><span><kbd>Space</kbd> Play / pause</span><span><kbd>Ctrl Z</kbd> Undo</span></div>
          <p className="help-disclosure">Open AR for a local camera overlay or room placement on supported devices. Aim at a floor or table, then place the scene. Choose Output to preview your composition, add video direction, and generate with Seedance. Live AI is optional.</p>
        </>}
      </section>
    </div>}
  </div>;
}
