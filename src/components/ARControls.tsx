import { Camera, Scan, X } from 'lucide-react';
import type { ARExperience, ARState } from '../scene/arExperience';

interface Props { state: ARState; experience: ARExperience | null; mirrored: boolean; onMirror: () => void; onClose: () => void; }
export default function ARControls({ state, experience, mirrored, onMirror, onClose }: Props) {
  const active = state.mode !== 'idle';
  return <section className="ar-panel" aria-label="Camera and AR">
    <div className="ar-heading"><strong><Scan size={17} /> Camera & AR</strong><button className="icon-button" aria-label="Close AR controls" onClick={onClose}><X size={17} /></button></div>
    <p className="panel-copy">See your scene through a camera, or place it on a real surface.</p>
    {state.message && <p className={state.phase === 'error' ? 'inline-error' : 'ar-status'} role={state.phase === 'error' ? 'alert' : 'status'}>{state.message}</p>}
    {state.mode === 'camera' && state.phase === 'live' && <>
      {state.cameras.length > 0 && <label className="field-label">Camera<select aria-label="Camera device" value={state.deviceId} onChange={e => void experience?.startCamera(e.target.value)}>{state.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.label}</option>)}</select></label>}
      <label className="review-check"><input type="checkbox" checked={mirrored} onChange={onMirror} />Mirror camera</label>
    </>}
    <div className="ar-actions">
      {active ? <button className="button secondary" onClick={() => experience?.stop()}>{state.phase === 'starting' ? 'Cancel camera / AR' : 'Stop camera / AR'}</button>
        : <button className="button primary" disabled={!experience} onClick={() => void experience?.startCamera()}><Camera size={15} />{state.phase === 'error' ? 'Retry camera' : 'Start camera'}</button>}
      <button className="button secondary" disabled={!experience || !state.supported || state.mode === 'ar' || state.phase === 'starting'} onClick={() => void experience?.startRoom()}><Scan size={15} />Place in room</button>
    </div>
    <p className="panel-copy small-copy">{state.supported === null ? 'Checking room placement support…' : state.supported ? 'AR is available. Surface tracking and controls are checked when you start.' : 'Room placement is unavailable in this browser. Use an AR-capable device over HTTPS.'}</p>
    <p className="panel-copy small-copy">Camera stays on this device. Stop it or switch views to turn it off.</p>
  </section>;
}
