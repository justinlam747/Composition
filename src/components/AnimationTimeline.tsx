import { useRef } from 'react';
import { Play, Pause, Scissors, Save, Trash2 } from 'lucide-react';
import { animationLibrary } from '../core/animationLibrary';
import { CAMERA_ID, type AnimationClip } from '../core/project';
import { studio, useStudio } from '../core/store';

function ClipBlock({ clip, duration }: { clip: AnimationClip; duration: number }) {
  const s = useStudio();
  const drag = useRef<{ x: number; start: number; duration: number; width: number; mode: 'move' | 'left' | 'right'; active: boolean } | null>(null);
  function down(event: React.PointerEvent, mode: 'move' | 'left' | 'right') {
    event.stopPropagation(); event.preventDefault(); studio.selectClip(clip.id);
    const rail = event.currentTarget.closest('.clip-rail')!;
    drag.current = { x: event.clientX, start: clip.start, duration: clip.duration, width: rail.getBoundingClientRect().width, mode, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent) {
    const value = drag.current; if (!value || !value.width) return;
    if (!value.active && Math.abs(event.clientX - value.x) < 3) return;
    if (!value.active) { studio.begin(); value.active = true; }
    const delta = Math.round((event.clientX - value.x) / value.width * duration * 30) / 30;
    if (value.mode === 'move') studio.transformClip(clip.id, Math.max(0, Math.min(duration - value.duration, value.start + delta)), value.duration);
    else if (value.mode === 'right') studio.transformClip(clip.id, value.start, Math.max(1 / 30, Math.min(duration - value.start, value.duration + delta)));
    else {
      const start = Math.max(0, Math.min(value.start + value.duration - 1 / 30, value.start + delta));
      studio.transformClip(clip.id, start, value.start + value.duration - start);
    }
  }
  function up() { if (drag.current?.active) studio.end(); drag.current = null; }
  const events = { onPointerMove: move, onPointerUp: up, onPointerCancel: up, onLostPointerCapture: up };
  return <div className={`animation-block${s.selectedClip === clip.id ? ' is-selected' : ''}`} role="button" tabIndex={0} aria-label={`${clip.name} animation block`} aria-pressed={s.selectedClip === clip.id}
    style={{ left: `${clip.start / duration * 100}%`, width: `${clip.duration / duration * 100}%` }}
    onPointerDown={event => down(event, 'move')} {...events} onDoubleClick={() => studio.selectClip(clip.id, true)}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); studio.selectClip(clip.id, true); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); studio.selectClip(clip.id); studio.transformClip(clip.id, clip.start + (event.key === 'ArrowRight' ? 1 : -1) / 30, clip.duration); }
    }}>
    <button className="clip-edge left" aria-label={`Resize start of ${clip.name}`} title="Drag to stretch" onPointerDown={event => down(event, 'left')} {...events} />
    <span><strong>{clip.name}</strong><small>{clip.duration.toFixed(2)}s</small></span>
    <button className="clip-edge right" aria-label={`Resize end of ${clip.name}`} title="Drag to stretch" onPointerDown={event => down(event, 'right')} {...events} />
  </div>;
}

export default function AnimationTimeline({ onManual }: { onManual: (id: string) => void }) {
  const s = useStudio();
  const selected = s.project.clips?.find(clip => clip.id === s.selectedClip);
  const objects = s.project.objects.filter(object => !object.hidden).map(object => ({ id: object.id, name: object.name }));
  if (s.project.camera) objects.push({ id: CAMERA_ID, name: 'Camera' });
  const splittable = selected && s.time > selected.start && s.time < selected.start + selected.duration;
  return <section className="timeline block-timeline" aria-label="Animation blocks timeline">
    <div className="timeline-toolbar">
      <button className="play-button" aria-label={s.playing ? 'Pause timeline' : 'Play timeline'} onClick={studio.togglePlay}>{s.playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button>
      <output className="timecode" aria-label="Current time">{s.time.toFixed(2)}<span> / {s.project.duration.toFixed(2)} s</span></output>
      <div className="timeline-actions"><button className="button secondary" disabled={!splittable} onClick={studio.splitClip}><Scissors size={14} />Split</button></div>
      <label className="duration-label">Duration <select aria-label="Timeline duration" value={s.project.duration} onChange={event => studio.duration(Number(event.target.value))}>{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 2}>{i + 2}s</option>)}</select></label>
    </div>
    <div className="timeline-content"><div className="timeline-tracks">
      <div className="timeline-ruler"><div className="ruler-label">Animation</div><div className="ruler-ticks">{Array.from({ length: s.project.duration + 1 }, (_, i) => <span key={i} style={{ left: `${i / s.project.duration * 100}%` }}>{i}<small>s</small></span>)}</div></div>
      <div className="clip-lanes">{objects.map(object => <div className="clip-lane" key={object.id}>
        <button className="lane-label" onClick={() => { studio.selectObject(object.id); if (!s.project.clips?.some(clip => clip.objectId === object.id)) onManual(object.id); }}>{object.name}</button>
        <div className="clip-rail" aria-label={`${object.name} animation track`} onPointerDown={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); studio.seek((event.clientX - rect.left) / rect.width * s.project.duration); } }}
          onDragOver={event => { if (event.dataTransfer.types.includes('application/x-composition-animation')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={event => {
            event.preventDefault(); const asset = animationLibrary.get().find(value => value.id === event.dataTransfer.getData('application/x-composition-animation')); if (!asset) return;
            const expected = object.id === CAMERA_ID ? 'camera' : s.project.objects.find(value => value.id === object.id)?.kind;
            if (asset.kind !== expected) { studio.patch({ status: 'Drop this animation onto a matching object track.' }); return; }
            const rect = event.currentTarget.getBoundingClientRect(); studio.selectObject(object.id); studio.addAnimation(asset, (event.clientX - rect.left) / rect.width * s.project.duration);
          }}>
          {s.project.clips?.filter(clip => clip.objectId === object.id).map(clip => <ClipBlock key={clip.id} clip={clip} duration={s.project.duration} />)}
          {!s.project.clips?.some(clip => clip.objectId === object.id) && <span className="clip-track-hint">{s.project.tracks.some(track => track.objectId === object.id) ? 'Manual keys · select to edit' : 'Drop animation here'}</span>}
        </div>
      </div>)}</div>
      <div className="playhead-area"><div className="playhead" style={{ left: `${s.time / s.project.duration * 100}%` }}><span /></div><input className="scrubber" type="range" aria-label="Timeline playhead" min="0" max={s.project.duration} step={1 / 30} value={s.time} onChange={event => studio.seek(Number(event.target.value))} /></div>
    </div>
    </div>
    <div className="timeline-footer"><span>{selected ? `${selected.name} · ${selected.source === 'prepared' ? 'Prepared animation' : selected.source === 'ai' ? 'AI generated' : 'Edited animation'}` : 'Drag to move · drag edges to change speed · double-click for keys'}</span>
      <div className="key-options"><button className="button" disabled={!selected} onClick={() => selected && studio.selectClip(selected.id, true)}>Edit keyframes</button><button className="icon-button" aria-label="Cache selected animation" title="Save to animation library" disabled={!selected} onClick={studio.cacheAnimation}><Save size={16} /></button><button className="icon-button" aria-label="Delete animation block" disabled={!selected} onClick={studio.deleteClip}><Trash2 size={16} /></button></div>
    </div>
  </section>;
}
