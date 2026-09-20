import { useEffect, useMemo, useRef, useState } from 'react';
import { Diamond, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { BONES, CAMERA_ID, clipSceneTime, clipSourceTime, defaultValue, motionSceneTime, motionTime, sampleTrack, type Channel, type Keyframe } from '../core/project';
import { type Axis, type HandleSide } from '../core/valueGraph';
import { studio, useStudio } from '../core/store';
import TimelineTransport from './TimelineTransport';
import TimelineModeSelect from './TimelineModeSelect';

function Field({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(2));
  useEffect(() => setDraft(value.toFixed(2)), [value]);
  return <label>{label}<input aria-label={`Value key ${label.toLowerCase()}`} type="number" step="any" value={draft}
    onChange={event => setDraft(event.target.value)} onBlur={() => {
      if (draft !== value.toFixed(2) && draft.trim() && Number.isFinite(Number(draft))) onCommit(Number(draft));
      setDraft(value.toFixed(2));
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export default function ValueTimeline() {
  const s = useStudio(), [axis, setAxis] = useState<Axis>(0);
  const clip = s.project.clips?.find(value => value.id === s.editingClip);
  const duration = clip?.duration ?? s.project.duration, offset = clip?.start ?? 0;
  const toScene = (time: number) => clip ? clipSceneTime(clip, time) : motionSceneTime(s.project, time, s.objectId);
  const toSource = (time: number) => clip ? clipSourceTime(clip, time) : motionTime(s.project, time, s.objectId);
  const track = (clip?.tracks ?? s.project.tracks).find(t => t.objectId === s.objectId && t.target === s.selected && t.channel === s.channel);
  const selected = track?.keys.find(key => key.id === s.selectedKey);
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; side?: HandleSide; x: number; y: number; time: number; value: number; width: number; height: number; min: number; max: number; active: boolean } | null>(null);
  const graph = useMemo(() => {
    const object = s.project.objects.find(value => value.id === s.objectId);
    const fallback = s.objectId === CAMERA_ID && s.channel !== 'scale' ? s.project.camera![s.channel]
      : s.selected === 'model' && object ? object[s.channel] : defaultValue(s.selected, s.channel);
    const times = [...new Set([...Array.from({ length: 241 }, (_, i) => offset + duration * i / 240),
      ...track?.keys.map(key => toScene(key.time)).filter(time => time >= offset && time <= offset + duration) ?? []])].sort((a, b) => a - b);
    const points = times.map(time => ({ time, value: sampleTrack(track, toSource(time), fallback)[axis] }));
    const keys = track?.keys.filter(key => toScene(key.time) >= offset - 1e-8 && toScene(key.time) <= offset + duration + 1e-8) ?? [];
    const values = [...points.map(point => point.value), ...keys.map(key => key.value[axis])];
    const low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max(high - low, .2) * .15;
    return { points, keys, min: low - padding, max: high + padding };
  }, [s.project, s.objectId, s.selected, s.channel, clip, track, axis, duration, offset]);
  const min = drag.current?.min ?? graph.min, max = drag.current?.max ?? graph.max;
  const x = (sceneTime: number) => (sceneTime - offset) / duration * 100;
  const y = (value: number) => (max - value) / (max - min) * 100;
  const keys = graph.keys;
  const index = selected ? track!.keys.indexOf(selected) : -1;
  const handles = selected ? (['in', 'out'] as const).flatMap(side => {
    const neighbor = track!.keys[index + (side === 'in' ? -1 : 1)];
    if (!neighbor) return [];
    const influence = selected.valueHandles?.[side]?.[axis] ?? 1 / 3;
    return [{ side, influence, time: toScene(selected.time + (neighbor.time - selected.time) * influence), active: selected.valueHandles?.[side]?.[axis] != null }];
  }) : [];
  function finish() { const active = drag.current?.active; drag.current = null; if (active) studio.end(); }
  useEffect(() => () => { if (drag.current?.active) studio.end(); }, []);
  function down(event: React.PointerEvent<HTMLButtonElement>, key: Keyframe, side?: HandleSide) {
    if (event.button !== 0 || !rail.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); studio.selectValueKey(key.id);
    const rect = rail.current.getBoundingClientRect();
    drag.current = { id: key.id, side, x: event.clientX, y: event.clientY, time: toScene(key.time), value: key.value[axis], width: rect.width, height: rect.height - 28, min, max, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d || !d.width || d.height <= 0) return;
    if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 3) return;
    if (!d.active) { studio.begin(); d.active = true; }
    if (d.side && selected) {
      const neighbor = track!.keys[index + (d.side === 'in' ? -1 : 1)];
      const rect = rail.current!.getBoundingClientRect();
      const sourceTime = toSource(offset + (event.clientX - rect.left) / rect.width * duration);
      studio.setValueHandle(d.id, axis, d.side, (sourceTime - selected.time) / (neighbor.time - selected.time));
    } else studio.updateValueKey(d.id, d.time + (event.clientX - d.x) / d.width * duration, axis,
      d.value - (event.clientY - d.y) / d.height * (d.max - d.min));
  }
  const properties = [...new Map([
    ...(['position', 'rotation', ...(s.objectId === CAMERA_ID ? [] : ['scale'])] as Channel[]).map(channel => ({ target: 'model', channel })),
    ...(clip?.tracks ?? s.project.tracks).filter(t => t.objectId === s.objectId),
    { target: s.selected, channel: s.channel },
  ].map(property => [`${property.target}:${property.channel}`, property])).values()];
  return <>
    <div className="timeline-toolbar"><TimelineTransport keyTimes={keys.map(key => toScene(key.time) - offset)} duration={duration} offset={offset} />
      <div className="timeline-actions"><button className="button key-button" aria-label="Add key" title="Add key" disabled={s.playing} onClick={studio.addKey}><Plus size={15} /><span>Add key</span></button></div><TimelineModeSelect />
    </div>
    <div className="value-property-bar">
      {!clip && <select aria-label="Animated object" value={s.objectId} onChange={event => studio.selectObject(event.target.value)}>{s.project.camera && <option value={CAMERA_ID}>Camera</option>}{s.project.objects.filter(object => !object.hidden).map(object => <option key={object.id} value={object.id}>{object.name}</option>)}</select>}
      <select aria-label="Graph property" value={`${s.selected}:${s.channel}`} onChange={event => { const [target, channel] = event.target.value.split(':'); studio.select(target, channel as Channel); }}>
        {properties.map(property => <option key={`${property.target}:${property.channel}`} value={`${property.target}:${property.channel}`}>{property.target === 'model' ? '' : `${BONES.find(bone => bone.id === property.target)?.name ?? property.target} · `}{property.channel[0].toUpperCase() + property.channel.slice(1)}</option>)}
      </select>
      <div className="value-axes" aria-label="Value axis">{(['X', 'Y', 'Z'] as const).map((label, i) => <button key={label} aria-label={`${label} value axis`} aria-pressed={axis === i} onClick={() => setAxis(i as Axis)}>{label}</button>)}</div>
      <span>{s.channel === 'rotation' ? 'Degrees' : s.channel === 'scale' ? 'Scale factor' : 'Scene units'}</span>
    </div>
    <div className="timeline-content value-content"><div className="timeline-tracks">
      <div className="timeline-ruler"><div className="ruler-label">Value / time</div><div className="ruler-ticks">{Array.from({ length: Math.floor(duration) + 1 }, (_, i) => <span key={i} style={{ left: `${i / duration * 100}%` }}>{i}<small>s</small></span>)}</div></div>
      <div className="value-lane"><div className="value-scale">{[max, (max + min) / 2, min].map((value, i) => <span key={i} style={{ top: `calc(14px + (100% - 28px) * ${i / 2})` }}>{value.toFixed(2)}</span>)}</div>
        <div className="value-rail" ref={rail} aria-label="Value graph" onPointerDown={event => {
          if (event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect(); studio.seek(offset + (event.clientX - rect.left) / rect.width * duration); studio.patch({ selectedKey: null });
        }}>
          <svg className="value-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="value-grid" d="M0 0H100 M0 50H100 M0 100H100" />
            <polyline points={graph.points.map(point => `${x(point.time)},${y(point.value)}`).join(' ')} />
            {selected && handles.map(handle => <line className={`value-handle-line${handle.active ? '' : ' is-pending'}`} key={handle.side} x1={x(toScene(selected.time))} x2={x(handle.time)} y1={y(selected.value[axis])} y2={y(selected.value[axis])} />)}
          </svg>
          {!keys.length && <span className="velocity-empty">Add property keys at the playhead</span>}
          {keys.map(key => <button key={key.id} className={`value-key${selected?.id === key.id ? ' is-selected' : ''}`}
            style={{ left: `${x(toScene(key.time))}%`, top: `calc(14px + (100% - 28px) * ${y(key.value[axis]) / 100})` }}
            aria-label={`Value key at ${(toScene(key.time) - offset).toFixed(2)} seconds`} aria-pressed={selected?.id === key.id}
            onPointerDown={event => down(event, key)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); studio.selectValueKey(key.id); }
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault(); studio.updateValueKey(key.id, toScene(key.time) + (event.key === 'ArrowLeft' ? -1 / 30 : event.key === 'ArrowRight' ? 1 / 30 : 0), axis,
                  key.value[axis] + (event.key === 'ArrowUp' ? .1 : event.key === 'ArrowDown' ? -.1 : 0));
              }
            }}><Diamond size={11} fill="currentColor" /></button>)}
          {selected && handles.map(handle => <button className={`value-handle${handle.active ? '' : ' is-pending'}`} key={`${selected.id}-${handle.side}`}
            style={{ left: `${x(handle.time)}%`, top: `calc(14px + (100% - 28px) * ${y(selected.value[axis]) / 100})` }}
            aria-label={`${handle.side === 'in' ? 'Incoming' : 'Outgoing'} value handle`} title={`${Math.round(handle.influence * 100)}% influence · drag horizontally to ease`}
            onPointerDown={event => down(event, selected, handle.side)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
            onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); studio.setValueHandle(selected.id, axis, handle.side,
                handle.influence + (event.key === 'ArrowRight' ? 1 : -1) * (handle.side === 'in' ? -1 : 1) * .01); }
            }}><span /></button>)}
        </div>
      </div>
      <div className="playhead-area"><div className="playhead" style={{ left: `${x(s.time)}%` }}><span /></div><input className="scrubber" aria-label="Timeline playhead" type="range" min="0" max={duration} step={1 / 30} value={Math.max(0, Math.min(duration, s.time - offset))} onChange={event => studio.seek(offset + Number(event.target.value))} /></div>
    </div></div>
    <div className="timeline-footer value-footer"><span>{selected ? 'Drag yellow handles to ease' : 'Select a key for handles'}</span><div className="key-options">{selected && <>
      <Field key={`${selected.id}-time`} label="Time" value={toScene(selected.time) - offset} onCommit={value => studio.updateValueKey(selected.id, offset + value, axis, selected.value[axis])} />
      <Field key={`${selected.id}-${axis}`} label="Value" value={selected.value[axis]} onCommit={value => studio.updateValueKey(selected.id, toScene(selected.time), axis, value)} />
      <button className="icon-button" aria-label="Reset value handles" title="Restore this axis's original interpolation" onClick={() => studio.resetValueHandles(selected.id, axis)}><RotateCcw size={14} /></button>
    </>}<button className="icon-button" aria-label="Delete selected keyframe" disabled={!selected} onClick={studio.deleteKey}><Trash2 size={15} /></button></div></div>
  </>;
}
