import { useEffect, useState } from 'react';
import { Diamond, Focus, X } from 'lucide-react';
import { api, assetUrl } from '../core/api';
import { BONES, CAMERA_ID, clipAt, clipSourceTime, type Channel, type Vec3, sample } from '../core/project';
import { clipPreview } from '../core/clips';
import { studio, useStudio } from '../core/store';
import { changeCameraView } from '../scene/cameraNavigation';

function AxisInput({ axis, value, channel, onCommit }: { axis: number; value: number; channel: Channel; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(2));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value.toFixed(2)); }, [value, focused]);
  function finish() {
    setFocused(false);
    const v = Number(draft);
    if (draft.trim() && Number.isFinite(v) && Math.abs(v) <= 10000) {
      const bounded = channel === 'scale' ? Math.max(.05, Math.min(10, v)) : v;
      if (Math.abs(bounded - value) > .00001) onCommit(bounded);
    } else setDraft(value.toFixed(2));
  }
  return <label className={`axis-input axis-${['x', 'y', 'z'][axis]}`}><span>{['X', 'Y', 'Z'][axis]}</span><input type="number" aria-label={`${channel} ${['X', 'Y', 'Z'][axis]}`} step={channel === 'rotation' ? 1 : .05} value={draft} onFocus={() => { studio.patch({ playing: false }); setFocused(true); }} onChange={e => setDraft(e.target.value)} onBlur={finish} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value.toFixed(2)); setFocused(false); } }} /><small>{channel === 'rotation' ? '\u00b0' : channel === 'position' ? 'm' : '\u00d7'}</small></label>;
}

export default function Inspector({ onClose }: { onClose: () => void }) {
  const s = useStudio();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const object = s.project.objects.find(o => o.id === s.objectId);
  const isCamera = s.objectId === CAMERA_ID && !!s.project.camera;
  async function centerView() {
    if (s.camera !== 'orbit') await changeCameraView('orbit');
    const current = studio.get();
    if (current.objectId !== s.objectId || current.project.id !== s.project.id) return;
    studio.patch({ frameRequest: current.frameRequest + 1, selectionActive: true });
  }
  async function saveObject() { if (!object) return; setBusy(true); setError(''); try { await api.saveObject({ ...object, scale: sample(s.project, 'model', 'scale', s.time, object.id) }); studio.patch({ status: 'Object saved to your library.' }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const project = clipPreview(s.project, s.editingClip), clip = clipAt(project, s.time, s.objectId);
  const value = sample(project, s.selected, s.channel, s.time, s.objectId);
  const onKey = (clip?.tracks ?? project.tracks).find(t => t.objectId === s.objectId && t.target === s.selected && t.channel === s.channel)?.keys.some(k => Math.abs(k.time - (clip ? clipSourceTime(clip, s.time) : s.time)) < 1 / 60);
  const channels: Channel[] = isCamera ? ['position', 'rotation'] : s.selected === 'model' ? ['position', 'rotation', 'scale'] : ['rotation'];
  return <aside className="inspector" aria-label="Pose controls">
    <div className="inspector-heading"><h2>{isCamera ? 'Camera' : object?.kind === 'humanoid' ? 'Pose' : object?.name ?? 'Object'}</h2><button className="icon-button center-object" title="Center view on this object" onClick={() => void centerView()}><Focus size={15} />Center view</button><button className="icon-button" aria-label="Close pose controls" onClick={onClose}><X size={18} /></button></div>
    {object?.kind === 'humanoid' && <label className="joint-select-label"><span className="sr-only">Selected joint</span><select aria-label="Selected joint" value={s.selected} onChange={e => studio.select(e.target.value, e.target.value === 'model' ? 'position' : 'rotation')}><option value="model">Whole character</option>{BONES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    <div className="transform-row"><div className="transform-tabs">{channels.map(channel => <button key={channel} className={s.channel === channel ? 'selected' : ''} onClick={() => studio.setMode(channel === 'position' ? 'translate' : channel === 'rotation' ? 'rotate' : 'scale')}>{channel === 'position' ? 'Move' : channel === 'rotation' ? 'Rotate' : 'Scale'}</button>)}</div>{s.selected === 'model' && <select className="space-select" aria-label="Transform coordinate space" value={s.space} onChange={e => studio.patch({ space: e.target.value as 'local' | 'world' })}><option value="world">World</option><option value="local">Local</option></select>}</div>
    <div className="axis-fields">{value.map((v, i) => <AxisInput key={`${s.selected}:${s.channel}:${i}`} axis={i} value={v} channel={s.channel} onCommit={n => { const current = studio.get(); const updated = [...sample(clipPreview(current.project, current.editingClip), s.selected, s.channel, current.time, s.objectId)] as Vec3; updated[i] = n; studio.setValue(updated); }} />)}</div>
    <div className="pose-time"><label>Time <input aria-label="Pose time" type="number" min="0" max={s.project.duration} step={1 / 30} value={Number(s.time.toFixed(2))} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) studio.seek(n); }} />s</label><button className="button primary save-key" disabled={(!object && !isCamera) || s.playing} onClick={studio.addKey}><Diamond size={14} fill={onKey ? 'currentColor' : 'none'} />{onKey ? 'Update key' : 'Add key'}</button></div>
    {isCamera && <div className="panel-actions"><button className="button secondary" onClick={() => changeCameraView(s.camera === 'shot' ? 'orbit' : 'shot')}>{s.camera === 'shot' ? 'Scene view' : 'Camera view'}</button><button className="button danger-text" onClick={() => studio.removeObject(CAMERA_ID)}>Delete camera</button></div>}
    {s.selected === 'model' && object && <details className="object-details"><summary>Object details</summary>
      <label className="field-label">Name<input aria-label="Object name" key={object.id + object.name} defaultValue={object.name} maxLength={120} onBlur={e => { if (e.target.value.trim() && e.target.value !== object.name) studio.object({ name: e.target.value.trim() }); }} /></label>
      <div className="dimension-fields">{['Width', 'Height', 'Depth'].map((label, axis) => <label key={label}>{label}<input aria-label={label} key={object.id + object.dimensions.join(',')} type="number" defaultValue={object.dimensions[axis]} min="0.05" max="20" step="0.05" onBlur={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= .05 && n <= 20) { const dimensions = [...object.dimensions] as Vec3; dimensions[axis] = n; if (n !== object.dimensions[axis]) studio.object({ dimensions }); } else e.target.value = String(object.dimensions[axis]); }} /><small>m</small></label>)}</div>
      <div className="reference-strip">{object.referenceAssetIds.map(id => <div key={id}><img src={assetUrl(id)} alt={`${object.name} reference`} /><button aria-label="Remove reference" onClick={() => studio.object({ referenceAssetIds: object.referenceAssetIds.filter(ref => ref !== id) })}><X size={12} /></button></div>)}</div>
      <label className="upload-label">Add reference image<input aria-label="Add reference image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || object.referenceAssetIds.length >= 9} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; const objectId = object.id, projectId = s.project.id; setBusy(true); setError(''); try { const asset = await api.upload(file, 'reference'); const current = studio.get(); if (current.project.id !== projectId || current.objectId !== objectId || !current.project.objects.some(o => o.id === objectId && !o.hidden)) throw new Error('Selection changed. Select the original object and upload again.'); studio.object({ referenceAssetIds: [...current.project.objects.find(o => o.id === objectId)!.referenceAssetIds, asset.id] }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); e.target.value = ''; } }} /></label>
      <div className="panel-actions"><button className="button secondary" disabled={busy} onClick={saveObject}>Save object</button><button className="button danger-text" onClick={() => studio.removeObject()}>Delete object</button></div>
      {error && <p role="alert" className="inline-error">{error}</p>}
    </details>}
  </aside>;
}
