import { useRef, useState } from 'react';
import { Download, FolderOpen, Plus, Save, X } from 'lucide-react';
import { animationLibrary, useAnimations } from '../core/animationLibrary';
import { studio, useStudio } from '../core/store';
import { changeCameraView } from '../scene/cameraNavigation';

export default function AnimationsPanel({ onClose }: { onClose: () => void }) {
  const assets = useAnimations(), input = useRef<HTMLInputElement>(null);
  const s = useStudio();
  const [error, setError] = useState('');
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(assets, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'composition-animations.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <aside id="animations-panel" className="assistant-panel animations-panel" aria-label="Animation library">
    <div className="panel-heading"><h2><FolderOpen size={21} />Animations</h2><button className="icon-button" aria-label="Close animations panel" onClick={onClose}><X size={19} /></button></div>
    <p className="panel-copy">Drag onto a matching track, or tap + to add an animation.</p>
    <div className="panel-actions">
      <button className="button secondary" onClick={async () => { if (studio.spiderDemo()) { onClose(); await changeCameraView('shot'); } }}>Load Spider-Man demo</button>
      {s.project.tracks.some(track => track.objectId === s.objectId) && !s.selectedClip && <button className="icon-button" aria-label="Cache current motion" title="Save current motion to library" onClick={studio.cacheAnimation}><Save size={17} /></button>}
    </div>
    <div className="animation-library-heading"><h3>Saved animations <span>{assets.length}</span></h3><div>
      <button className="icon-button" aria-label="Export animation library" title="Export library" onClick={download}><Download size={17} /></button>
      <button className="icon-button" aria-label="Import animation library" title="Import library" onClick={() => input.current?.click()}><FolderOpen size={17} /></button>
    </div></div>
    <div className="animation-assets">{assets.map(asset => <div className="animation-asset" key={asset.id} draggable onDragStart={event => { event.dataTransfer.setData('application/x-composition-animation', asset.id); event.dataTransfer.effectAllowed = 'copy'; }}>
      <div><strong>{asset.name}</strong><span>{(asset.range?.duration ?? asset.duration).toFixed(1)}s · {asset.source === 'prepared' ? 'Prepared' : asset.source === 'ai' ? 'AI generated' : 'Saved edit'}</span></div>
      <button aria-label={`Add ${asset.name}`} title="Add to timeline" onClick={() => studio.addAnimation(asset)}><Plus size={18} /></button>
    </div>)}</div>
    <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Animation library file" onChange={async event => {
      const field = event.currentTarget;
      try { const file = field.files?.[0]; if (!file) return; if (file.size > 8_000_000) throw new Error('The animation library is too large.'); animationLibrary.import(await file.text()); setError(''); }
      catch (err) { setError((err as Error).message); } finally { field.value = ''; }
    }} />
    {error && <p role="alert" className="inline-error">{error}</p>}
  </aside>;
}
