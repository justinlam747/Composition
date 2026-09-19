import { useRef, useState } from 'react';
import { ArrowLeft, Diamond, Play, Pause, Repeat2, SkipBack, SkipForward, Plus, Trash2, ChevronDown } from 'lucide-react';
import { BONES, CAMERA_ID, clipSceneTime, type Channel, type Track, type Keyframe, type Ease } from '../core/project';
import { studio, useStudio } from '../core/store';
import AnimationTimeline from './AnimationTimeline';

function Lane({ target, channel, label, track, duration, offset }: { target: string; channel: Channel; label: string; track?: Track; duration: number; offset: number }) {
  const s = useStudio();
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; time: number; width: number; active: boolean } | null>(null);
  const selected = s.selected === target && s.channel === channel;
  function down(event: React.PointerEvent, key: Keyframe) {
    event.stopPropagation(); event.preventDefault();
    studio.select(target, channel); studio.seek(key.time + offset); studio.patch({ selectedKey: key.id });
    drag.current = { id: key.id, x: event.clientX, time: key.time, width: rail.current!.getBoundingClientRect().width, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    if (!d.active && Math.abs(event.clientX - d.x) < 3) return;
    if (!d.active) { studio.begin(); d.active = true; }
    studio.moveKey(d.id, offset + Math.max(0, Math.min(duration, d.time + (event.clientX - d.x) / d.width * duration)));
  }
  function up() { if (drag.current?.active) studio.end(); drag.current = null; }
  return <div className={`timeline-lane ${selected ? 'lane-selected' : ''}`}>
    <button className="lane-label" onClick={() => studio.select(target, channel)}><span className={`track-dot ${channel}`} /><span>{label}</span><span className="lane-count">{track?.keys.length || <span className="muted">&mdash;</span>}</span></button>
    <div ref={rail} className="lane-rail" onPointerDown={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect(); studio.select(target, channel); studio.seek(offset + (event.clientX - rect.left) / rect.width * duration);
    }}>
      <div className="lane-line" />
      {track?.keys.map(key => <button key={key.id} className={`keyframe ${s.selectedKey === key.id ? 'key-selected' : ''}`} style={{ left: `${key.time / duration * 100}%` }}
        aria-label={`${label} key at ${key.time.toFixed(2)} seconds`} title={`${key.time.toFixed(2)}s / ${key.ease}. Drag to retime.`}
        onPointerDown={e => down(e, key)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); studio.select(target, channel); studio.seek(key.time + offset); studio.patch({ selectedKey: key.id }); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); studio.select(target, channel); studio.seek(key.time + offset); studio.moveKey(key.id, offset + key.time + (e.key === 'ArrowRight' ? 1 : -1) / 30); }
        }}><Diamond size={11} fill="currentColor" /></button>)}
    </div>
  </div>;
}

function VelocityGraph({ keyframe }: { keyframe?: Keyframe }) {
  const graph = useRef<SVGSVGElement>(null);
  const power = keyframe?.easePower ?? 2;
  function update(event: React.PointerEvent<SVGSVGElement>) {
    if (!keyframe || keyframe.ease !== 'ease-in' || !graph.current) return;
    const rect = graph.current.getBoundingClientRect();
    const velocity = Math.max(.02, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    const next = 1 + Math.log(velocity) / Math.log(.5);
    studio.easePower(next);
  }
  const points = Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    const velocity = t === 0 ? 0 : t ** (power - 1);
    return `${(t * 100).toFixed(2)},${(42 - velocity * 34).toFixed(2)}`;
  }).join(' ');
  const handleY = 42 - (.5 ** (power - 1)) * 34;
  return <div className="velocity-editor" aria-label="Ease-in velocity graph">
    <div className="velocity-heading"><span>Velocity graph</span><small>{keyframe?.ease === 'ease-in' ? 'Drag the curve to shape the acceleration' : 'Choose Ease in to edit the curve'}</small></div>
    <svg ref={graph} className={`velocity-graph${keyframe?.ease === 'ease-in' ? ' is-editable' : ''}`} viewBox="0 0 100 48" role="img" aria-label="Ease-in velocity curve" onPointerDown={event => { if (keyframe?.ease === 'ease-in') { event.currentTarget.setPointerCapture(event.pointerId); update(event); } }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event); }}>
      <path className="velocity-grid" d="M0 42H100 M0 25H100 M0 8H100 M0 42V8 M50 42V8 M100 42V8" />
      <polyline className="velocity-line" points={points} />
      {keyframe?.ease === 'ease-in' && <circle className="velocity-handle" cx="50" cy={handleY} r="3" />}
    </svg>
    <label className="velocity-power">Ease-in power <input aria-label="Ease-in power" type="range" min=".25" max="4" step=".05" value={power} disabled={keyframe?.ease !== 'ease-in'} onChange={event => studio.easePower(Number(event.target.value))} /><output>{power.toFixed(2)}</output></label>
  </div>;
}

export default function Timeline({ collapsed = false }: { collapsed?: boolean }) {
  const s = useStudio();
  const [manualOpen, setManualOpen] = useState(false);
  if (collapsed) return null;
  const clip = s.project.clips?.find(value => value.id === s.editingClip);
  if ((s.project.clips?.length || (!s.project.tracks.length && s.objectId !== CAMERA_ID)) && !clip && !manualOpen) return <AnimationTimeline onManual={() => setManualOpen(true)} />;
  const duration = clip?.duration ?? s.project.duration, offset = clip?.start ?? 0, time = Math.max(0, Math.min(duration, s.time - offset));
  const tracks = clip ? clip.tracks.map(track => ({ ...track, keys: track.keys.filter(key => key.time >= clip.sourceStart - 1e-8 && key.time <= clip.sourceEnd + 1e-8)
    .map(key => ({ ...key, time: clipSceneTime(clip, key.time) - clip.start })) })) : s.project.tracks;
  const selectedBone = s.selected === 'model' ? 'chest' : s.selected;
  const boneName = BONES.find(b => b.id === selectedBone)?.name ?? 'Chest';
  const lanes: { target: string; channel: Channel; label: string }[] = clip ? tracks.map(track => ({ target: track.target, channel: track.channel,
    label: track.target === 'model' ? track.channel[0].toUpperCase() + track.channel.slice(1) : BONES.find(bone => bone.id === track.target)?.name ?? track.target })) : [
    { target: 'model', channel: 'position', label: 'Position' },
    { target: 'model', channel: 'rotation', label: 'Rotation' },
    ...(s.objectId === CAMERA_ID ? [] : [{ target: 'model', channel: 'scale' as const, label: 'Scale' }]),
    ...(s.project.objects.find(o => o.id === s.objectId)?.kind === 'humanoid' ? [{ target: selectedBone, channel: 'rotation' as const, label: boneName }] : []),
  ];
  const selectedKey = tracks.flatMap(t => t.keys).find(k => k.id === s.selectedKey);
  const keyTimes = [...new Set(tracks.filter(t => t.objectId === s.objectId && t.target === s.selected && t.channel === s.channel).flatMap(t => t.keys.map(k => k.time)))].sort((a, b) => a - b);
  return <section className={`timeline${clip ? ' clip-keyframe-editor' : ''}`} aria-label={clip ? `${clip.name} keyframes` : s.objectId === CAMERA_ID ? 'Camera animation timeline' : 'Model animation timeline'}>
    {(clip || manualOpen) && <div className="clip-breadcrumb"><button onClick={() => { studio.patch({ editingClip: null, selectedKey: null, selectionActive: false }); setManualOpen(false); }}><ArrowLeft size={14} />All blocks</button><strong>{clip?.name ?? 'Manual keyframes'}</strong><span>{clip ? 'Edits affect this block only' : 'Scene keys'}</span></div>}
    <div className="timeline-toolbar">
      <div className="transport">
        <button className="icon-button" aria-label="Previous keyframe" title="Previous keyframe" onClick={() => studio.seek(offset + ([...keyTimes].reverse().find(t => t < time - .02) ?? 0))}><SkipBack size={16} /></button>
        <button className="play-button" aria-label={s.playing ? 'Pause timeline' : 'Play timeline'} title="Play / pause (Space)" disabled={!s.project.camera && !s.project.objects.some(o => !o.hidden)} onClick={studio.togglePlay}>{s.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
        <button className="icon-button" aria-label="Next keyframe" title="Next keyframe" onClick={() => studio.seek(offset + (keyTimes.find(t => t > time + .02) ?? duration))}><SkipForward size={16} /></button>
        <output className="timecode" aria-label="Current time" aria-live="off">{time.toFixed(2)}<span> / {duration.toFixed(2)} s</span></output>
        <button className={`icon-button ${s.loop ? 'is-on' : ''}`} aria-label="Loop timeline" aria-pressed={s.loop} title="Loop timeline" onClick={() => studio.patch({ loop: !s.loop })}><Repeat2 size={17} /></button>
      </div>
      <div className="timeline-actions"><button className="button key-button" onClick={studio.addKey} disabled={(!s.project.camera && !s.project.objects.some(o => !o.hidden)) || s.playing}><Plus size={15} /> Add key</button></div>
      {!clip && <label className="duration-label">Duration <select aria-label="Timeline duration" value={s.project.duration} onChange={e => studio.duration(Number(e.target.value))}>{Array.from({ length: 9 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} s</option>)}</select><ChevronDown size={11} /></label>}
    </div>
    <div className="timeline-content"><div className="timeline-tracks">
      <div className="timeline-ruler"><div className="ruler-label">{clip ? 'Keyframes' : <select aria-label="Animated object" value={s.objectId} onChange={e => studio.selectObject(e.target.value)}>{s.project.camera && <option value={CAMERA_ID}>Camera</option>}{s.project.objects.filter(o => !o.hidden).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}</div><div className="ruler-ticks">{Array.from({ length: Math.floor(duration) + 1 }, (_, i) => <span key={i} style={{ left: `${i / duration * 100}%` }}>{i}<small>s</small></span>)}</div></div>
      <div className="lanes">{lanes.map(lane => <Lane key={`${lane.target}:${lane.channel}`} {...lane} duration={duration} offset={offset} track={tracks.find(t => t.objectId === s.objectId && t.target === lane.target && t.channel === lane.channel)} />)}</div>
      <div className="playhead-area"><div className="playhead" style={{ left: `${time / duration * 100}%` }}><span /></div><input className="scrubber" type="range" aria-label="Timeline playhead" min="0" max={duration} step={1 / 30} value={time} onChange={e => studio.seek(offset + Number(e.target.value))} /></div>
    </div>
    </div>
    {selectedKey?.ease === 'ease-in' && <VelocityGraph keyframe={selectedKey} />}
    <div className="timeline-footer"><span>{selectedKey ? `Key at ${selectedKey.time.toFixed(2)}s` : 'Select a key to edit'}</span><div className="key-options"><label><span className="sr-only">Interpolation</span><select disabled={!selectedKey} aria-label="Keyframe interpolation" value={selectedKey?.ease ?? 'smooth'} onChange={e => studio.ease(e.target.value as Ease)}><option value="smooth">Smooth</option><option value="linear">Linear</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option></select></label><button className="icon-button" aria-label="Delete selected keyframe" title="Delete selected keyframe" disabled={!selectedKey} onClick={studio.deleteKey}><Trash2 size={15} /></button></div></div>
  </section>;
}
