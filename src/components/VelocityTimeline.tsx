import { useEffect, useMemo, useRef, useState } from 'react';
import { Diamond, Plus, Trash2 } from 'lucide-react';
import { CAMERA_ID, clipTimelineSceneTime, clipTimelineTime } from '../core/project';
import { MAX_SPEED, velocityAt, type VelocityKey } from '../core/velocity';
import { studio, useStudio } from '../core/store';
import TimelineTransport from './TimelineTransport';

const EMPTY_KEYS: VelocityKey[] = [];

function NumberField({ label, value, max, step, onCommit }: { label: string; value: number; max: number; step: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(2));
  useEffect(() => setDraft(value.toFixed(2)), [value]);
  return <label>{label}<input aria-label={`Velocity key ${label.toLowerCase()}`} type="number" min="0" max={max} step={step} value={draft}
    onChange={event => setDraft(event.target.value)} onBlur={() => {
      const next = Number(draft);
      if (draft.trim() && Number.isFinite(next)) onCommit(Math.max(0, Math.min(max, next)));
      setDraft(value.toFixed(2));
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export default function VelocityTimeline() {
  const s = useStudio();
  const clip = s.project.clips?.find(value => value.id === s.editingClip);
  const duration = clip?.duration ?? s.project.duration, offset = clip?.start ?? 0;
  const time = Math.max(0, Math.min(duration, s.time - offset));
  const sourceKeys = clip ? clip.velocityKeys ?? EMPTY_KEYS : s.project.velocities?.find(track => track.objectId === s.objectId)?.keys ?? EMPTY_KEYS;
  const { keys, points } = useMemo(() => {
    const keys = sourceKeys.map(key => ({ ...key, time: clip ? clipTimelineSceneTime(clip, key.time) - offset : key.time }))
      .filter(key => key.time >= -1e-8 && key.time <= duration + 1e-8);
    const speedAt = (at: number) => velocityAt(sourceKeys, clip ? clipTimelineTime(clip, offset + at) : at);
    const points = [{ time: 0, speed: speedAt(0) }, ...keys, { time: duration, speed: speedAt(duration) }]
      .map(key => `${key.time / duration * 100},${100 - key.speed / MAX_SPEED * 100}`).join(' ');
    return { keys, points };
  }, [sourceKeys, clip, duration, offset]);
  const selected = keys.find(key => key.id === s.selectedVelocityKey);
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; time: number; speed: number; width: number; height: number; active: boolean } | null>(null);
  function finish() { if (drag.current?.active) studio.end(); drag.current = null; }
  useEffect(() => () => { if (drag.current?.active) studio.end(); }, []);
  function down(event: React.PointerEvent<HTMLButtonElement>, key: VelocityKey) {
    if (event.button !== 0 || !rail.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
    studio.selectVelocityKey(key.id);
    const rect = rail.current.getBoundingClientRect();
    drag.current = { id: key.id, x: event.clientX, y: event.clientY, time: key.time, speed: key.speed, width: rect.width, height: rect.height - 28, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || !d.width || d.height <= 0) return;
    if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 3) return;
    if (!d.active) { studio.begin(); d.active = true; }
    studio.updateVelocityKey(d.id, offset + Math.max(0, Math.min(duration, d.time + (event.clientX - d.x) / d.width * duration)),
      Math.round((d.speed - (event.clientY - d.y) / d.height * MAX_SPEED) * 100) / 100);
  }
  return <>
    <div className="timeline-toolbar">
      <TimelineTransport keyTimes={keys.map(key => key.time)} duration={duration} offset={offset} velocity />
      <div className="timeline-actions"><button className="button key-button" aria-label="Add velocity key" disabled={s.playing} onClick={studio.addVelocityKey}><Plus size={15} /><span>Add key</span></button></div>
      <button className="button timeline-mode-switch is-on" aria-label="Velocity timeline mode" aria-pressed="true" title="Switch to transform keyframes" onClick={() => studio.patch({ timelineMode: 'keys', selectedVelocityKey: null })}>Velocity</button>
    </div>
    <div className="timeline-content velocity-content"><div className="timeline-tracks">
      <div className="timeline-ruler"><div className="ruler-label">{clip ? 'Velocity' : <select aria-label="Animated object" value={s.objectId} onChange={event => studio.selectObject(event.target.value)}>{s.project.camera && <option value={CAMERA_ID}>Camera</option>}{s.project.objects.filter(object => !object.hidden).map(object => <option key={object.id} value={object.id}>{object.name}</option>)}</select>}</div>
        <div className="ruler-ticks">{Array.from({ length: Math.floor(duration) + 1 }, (_, i) => <span key={i} style={{ left: `${i / duration * 100}%` }}>{i}<small>s</small></span>)}</div>
      </div>
      <div className="velocity-lane">
        <div className="velocity-lane-label"><strong>Velocity</strong><span>{MAX_SPEED}</span><span>0</span></div>
        <div ref={rail} className="velocity-rail" aria-label="Velocity track" onPointerDown={event => {
          if (event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          studio.seek(offset + (event.clientX - rect.left) / rect.width * duration);
          studio.patch({ selectedVelocityKey: null });
        }} onDoubleClick={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          studio.seek(offset + (event.clientX - rect.left) / rect.width * duration); studio.begin(); studio.addVelocityKey();
          const id = studio.get().selectedVelocityKey;
          if (id) studio.updateVelocityKey(id, studio.get().time, (1 - (event.clientY - rect.top - 14) / (rect.height - 28)) * MAX_SPEED);
          studio.end();
        }}>
          <svg className="velocity-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="velocity-grid" d="M0 0H100 M0 50H100 M0 100H100" /><polyline points={points} /></svg>
          {!keys.length && <span className="velocity-empty">Add velocity keys at the playhead</span>}
          {keys.map(key => <button key={key.id} className={`velocity-key${selected?.id === key.id ? ' is-selected' : ''}`}
            style={{ left: `${key.time / duration * 100}%`, top: `calc(14px + (100% - 28px) * ${1 - key.speed / MAX_SPEED})` }}
            aria-label={`Velocity key at ${key.time.toFixed(2)} seconds`} aria-pressed={selected?.id === key.id} title={`${key.time.toFixed(2)}s · ${key.speed.toFixed(2)} relative speed`}
            onPointerDown={event => down(event, key)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
            onDoubleClick={event => event.stopPropagation()} onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); studio.selectVelocityKey(key.id); }
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault(); studio.selectVelocityKey(key.id);
                studio.updateVelocityKey(key.id, offset + key.time + (event.key === 'ArrowRight' ? 1 / 30 : event.key === 'ArrowLeft' ? -1 / 30 : 0),
                  key.speed + (event.key === 'ArrowUp' ? .1 : event.key === 'ArrowDown' ? -.1 : 0));
              }
            }}><Diamond size={11} fill="currentColor" /></button>)}
        </div>
      </div>
      <div className="playhead-area"><div className="playhead" style={{ left: `${time / duration * 100}%` }}><span /></div><input className="scrubber" aria-label="Timeline playhead" type="range" min="0" max={duration} step={1 / 30} value={time} onChange={event => studio.seek(offset + Number(event.target.value))} /></div>
    </div></div>
    <div className="timeline-footer velocity-footer">
      <span title="Speed values are relative; the animation keeps its duration. All-zero keys pause motion.">Relative speed · fixed duration</span>
      <div className="key-options">{selected && <>
        <NumberField key={`${selected.id}-time`} label="Time" value={selected.time} max={duration} step={1 / 30} onCommit={value => studio.updateVelocityKey(selected.id, offset + value, selected.speed)} />
        <NumberField key={`${selected.id}-speed`} label="Speed" value={selected.speed} max={MAX_SPEED} step={.1} onCommit={value => studio.updateVelocityKey(selected.id, offset + selected.time, value)} />
      </>}
        <button className="icon-button" aria-label="Delete selected velocity keyframe" disabled={!selected} onClick={studio.deleteVelocityKey}><Trash2 size={15} /></button>
      </div>
    </div>
  </>;
}
