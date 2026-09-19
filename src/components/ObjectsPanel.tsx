import { useEffect, useState } from 'react';
import { Box, Camera, Plus, UserRound, X } from 'lucide-react';
import { api, assetUrl, type SavedObject } from '../core/api';
import { studio, useStudio } from '../core/store';
import { CAMERA_ID, hasCharacter } from '../core/project';
import { objectFromSpec } from '../core/proposals';
export default function ObjectsPanel({ onClose }: { onClose: () => void }) {
  const s = useStudio(); const [library, setLibrary] = useState<SavedObject[]>([]), [error, setError] = useState('');
  useEffect(() => { let active = true; api.objects().then(items => { if (active) setLibrary(items); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <aside className="assistant-panel" aria-label="Scene objects">
    <div className="panel-heading"><div><span className="eyebrow">Build your composition</span><h2>Objects</h2></div><button className="icon-button" aria-label="Close objects panel" onClick={onClose}><X size={19} /></button></div>
    <div className="panel-actions"><button className="button primary" disabled={s.project.objects.length >= 32} onClick={studio.addBox}><Plus size={15} />Add box</button><button className="button secondary" disabled={hasCharacter(s.project) || s.project.objects.length >= 32} onClick={studio.add}><UserRound size={15} />Add humanoid</button></div>
    {!s.project.camera && <button className="button secondary wide" onClick={() => studio.addCamera()}><Camera size={15} />Add camera</button>}
    {s.project.camera && <div className="object-list"><button className={s.objectId === CAMERA_ID ? 'selected' : ''} onClick={() => { studio.selectObject(CAMERA_ID); onClose(); }}><Camera size={19} /><span><strong>Camera</strong><small>{s.project.tracks.some(t => t.objectId === CAMERA_ID) ? 'Animated' : 'Static'} · 16:9 frame</small></span></button></div>}
    <p className="panel-copy">New objects start static. Select one to move, rotate, resize or animate it.</p>
    <div className="object-list">{s.project.objects.filter(o => !o.hidden).map(o => <button key={o.id} className={o.id === s.objectId ? 'selected' : ''} onClick={() => { studio.selectObject(o.id); onClose(); }}>{o.kind === 'humanoid' ? <UserRound size={19} /> : <Box size={19} />}<span><strong>{o.name}</strong><small>{o.dimensions.join(' × ')} m · {s.project.tracks.filter(t => t.objectId === o.id).length ? 'Animated' : 'Static'}</small></span>{o.referenceAssetIds[0] && <img src={assetUrl(o.referenceAssetIds[0])} alt="Reference" />}</button>)}</div>
    <div className="panel-section"><h3>Saved objects</h3><p className="panel-copy">Save an object from its controls or an AI suggestion to use it again.</p>{library.map(item => <div className="library-item" key={item.id}>{item.object.referenceAssetIds[0] && <img src={assetUrl(item.object.referenceAssetIds[0])} alt={item.object.name} />}<span>{item.object.name}</span><button className="button secondary" disabled={item.object.kind === 'humanoid' && hasCharacter(s.project) || s.project.objects.length >= 32} onClick={() => { try { studio.spawn(objectFromSpec(item.object, s.project)); onClose(); } catch (e) { setError((e as Error).message); } }}>Spawn</button></div>)}</div>
    {error && <p role="alert" className="inline-error">{error}</p>}
  </aside>;
}
