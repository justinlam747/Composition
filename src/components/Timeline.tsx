import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Diamond, Plus, Trash2 } from 'lucide-react';
import { BONES, CAMERA_ID, clipSceneTime, motionSceneTime, type Channel, type Track, type Keyframe } from '../core/project';
import { studio, useStudio } from '../core/store';
import AnimationTimeline from './AnimationTimeline';
import VelocityTimeline from './VelocityTimeline';
import TimelineTransport from './TimelineTransport';
import TimelineModeSelect from './TimelineModeSelect';
import ValueTimeline from './ValueTimeline';

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

export default function Timeline({ collapsed = false }: { collapsed?: boolean }) {
  const s = useStudio();
  const [manualOpen, setManualOpen] = useState(false);
  const graphMode = s.timelineMode !== 'keys';
  const clip = s.project.clips?.find(value => value.id === s.editingClip);
  const duration = clip?.duration ?? s.project.duration, offset = clip?.start ?? 0, time = Math.max(0, Math.min(duration, s.time - offset));
  const tracks = useMemo(() => graphMode ? [] : clip ? clip.tracks.map(track => ({ ...track,
    keys: track.keys.map(key => ({ ...key, time: clipSceneTime(clip, key.time) - clip.start })).filter(key => key.time >= -1e-8 && key.time <= duration + 1e-8) }))
    : s.project.tracks.map(track => ({ ...track, keys: track.keys.map(key => ({ ...key, time: motionSceneTime(s.project, key.time, track.objectId) })) })), [s.project, clip, duration, graphMode]);
  if (collapsed) return null;
  if ((s.project.clips?.length || (!s.project.tracks.length && s.objectId !== CAMERA_ID)) && !clip && !manualOpen) return <AnimationTimeline onManual={() => setManualOpen(true)} />;
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
  return <section className={`timeline${clip ? ' clip-keyframe-editor' : ''}${graphMode ? ' velocity-timeline' : ''}`} aria-label={clip ? `${clip.name} keyframes` : s.objectId === CAMERA_ID ? 'Camera animation timeline' : 'Model animation timeline'}>
    {(clip || manualOpen) && <div className="clip-breadcrumb"><button onClick={() => { studio.patch({ editingClip: null, selectedKey: null, selectedVelocityKey: null, timelineMode: 'keys', selectionActive: false }); setManualOpen(false); }}><ArrowLeft size={14} />All blocks</button><strong>{clip?.name ?? 'Manual keyframes'}</strong><span>{clip ? 'Edits affect this block only' : 'Scene keys'}</span></div>}
    {s.timelineMode === 'value' ? <ValueTimeline /> : s.timelineMode === 'velocity' ? <VelocityTimeline /> : <><div className="timeline-toolbar">
      <TimelineTransport keyTimes={keyTimes} duration={duration} offset={offset} />
      <div className="timeline-actions"><button className="button key-button" aria-label="Add key" title="Add key" onClick={studio.addKey} disabled={(!s.project.camera && !s.project.objects.some(o => !o.hidden)) || s.playing}><Plus size={15} /><span>Add key</span></button></div>
      <TimelineModeSelect />
      {!clip && <label className="duration-label">Duration <select aria-label="Timeline duration" value={s.project.duration} onChange={e => studio.duration(Number(e.target.value))}>{Array.from({ length: 9 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} s</option>)}</select></label>}
    </div>
    <div className="timeline-content"><div className="timeline-tracks">
      <div className="timeline-ruler"><div className="ruler-label">{clip ? 'Keyframes' : <select aria-label="Animated object" value={s.objectId} onChange={e => studio.selectObject(e.target.value)}>{s.project.camera && <option value={CAMERA_ID}>Camera</option>}{s.project.objects.filter(o => !o.hidden).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}</div><div className="ruler-ticks">{Array.from({ length: Math.floor(duration) + 1 }, (_, i) => <span key={i} style={{ left: `${i / duration * 100}%` }}>{i}<small>s</small></span>)}</div></div>
      <div className="lanes">{lanes.map(lane => <Lane key={`${lane.target}:${lane.channel}`} {...lane} duration={duration} offset={offset} track={tracks.find(t => t.objectId === s.objectId && t.target === lane.target && t.channel === lane.channel)} />)}</div>
        <div className="playhead-area"><div className="playhead" style={{ left: `${time / duration * 100}%` }}><span /></div><input className="scrubber" type="range" aria-label="Timeline playhead" min="0" max={duration} step={1 / 30} value={time} onChange={e => studio.seek(offset + Number(e.target.value))} /></div>
    </div>
    </div>
    <div className="timeline-footer"><span>{selectedKey ? `Key at ${selectedKey.time.toFixed(2)}s` : 'Select a key to edit'}</span><div className="key-options"><button className="icon-button" aria-label="Delete selected keyframe" title="Delete selected keyframe" disabled={!selectedKey} onClick={studio.deleteKey}><Trash2 size={15} /></button></div></div></>}
  </section>;
}
