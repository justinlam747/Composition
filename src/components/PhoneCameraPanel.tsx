import { useEffect, useState } from 'react';
import { Circle, MoreHorizontal, Pause, Play, Smartphone, Square, X } from 'lucide-react';
import { phoneCamera, usePhoneCamera } from '../scene/phoneCamera';
import { latencyPercentile } from '../core/phoneLatency';
import DropdownMenu from './DropdownMenu';

export default function PhoneCameraPanel({ onClose }: { onClose: () => void }) {
  const phone = usePhoneCamera();
  const [debug, setDebug] = useState(false);
  const [positions, setPositions] = useState(phoneCamera.positionDiagnostics);
  const xyz = (value: number[] | null) => value ? value.map(number => number.toFixed(3)).join(', ') : '—';
  const preview = phone.preview, diagnostic = preview.diagnostics;
  const ms = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(1)} ms`;
  function exportResults() {
    const data = { capturedAt: new Date().toISOString(), browser: navigator.userAgent, ...preview,
      medianMs: latencyPercentile(diagnostic?.samples ?? [], .5), p95Ms: latencyPercentile(diagnostic?.samples ?? [], .95),
      measurement: 'Phone control event to decoded returned marker. Not physical motion-to-photon. Desktop receive-to-render excludes phone/network latency.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `composition-latency-${preview.mode}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  }
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!debug) return;
    setPositions(phoneCamera.positionDiagnostics());
    const timer = setInterval(() => setPositions(phoneCamera.positionDiagnostics()), 250);
    return () => clearInterval(timer);
  }, [debug]);
  useEffect(() => { let active = true;
    fetch('/api/phone').then(response => response.json()).then(value => { if (active) setEnabled(value.enabled); }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; phoneCamera.disconnect(); };
  }, []);
  return <aside className="assistant-panel" aria-label="Phone camera">
    <div className="panel-heading"><div><span className="eyebrow">Move to direct</span><h2><Smartphone size={19} /> Phone camera</h2></div><div className="phone-panel-actions">
      <DropdownMenu label="Phone camera options" className="phone-options" items={[{ label: 'Debug information', checked: debug, onSelect: () => setDebug(!debug) }]}><MoreHorizontal size={19} /></DropdownMenu>
      <button className="icon-button" aria-label="Close phone camera" onClick={onClose}><X size={19} /></button></div></div>
    <p className="panel-copy">Use your iPhone to move through the shot. Your subject stays in place while you walk closer, pull back, or pan.</p>
    {enabled === false && <p className="inline-error">The phone bridge is offline. Follow the <a href="/phone-setup.html" target="_blank" rel="noreferrer">setup guide</a> to start it and install the iPhone companion.</p>}
    {!phone.pairing ? <button className="button primary" disabled={!enabled} onClick={() => void phoneCamera.pair()}>Pair iPhone</button> : <>
      <div className="phone-pairing"><span className="field-label">Computer address</span>{phone.pairing.addresses.length ? phone.pairing.addresses.map(address => <p key={address}>{address}</p>) : <p>Connect this computer to Wi-Fi first.</p>}<span className="field-label">Pairing code</span><strong>{phone.pairing.code}</strong><p className="panel-copy small-copy">Use the same Wi-Fi network. The code expires after 10 minutes if unused.</p></div>
      <p className="phone-tracking" role="status"><span className={phone.tracking === 'normal' ? 'saved-dot' : ''} />{phone.connected ? phone.tracking === 'normal' ? 'Tracking ready' : 'Finding the room…' : 'Waiting for iPhone'}</p>
      <button className="button secondary" disabled={phone.tracking !== 'normal' || phone.recording} onClick={() => void phoneCamera.align()}>Set starting pose</button>
      <p className="panel-copy small-copy">Frame your starting view, hold the phone comfortably, then set its starting pose.</p>
      <label className="phone-sensitivity"><span>Movement sensitivity <strong>{phone.translationScale}×</strong></span>
        <input aria-label="Movement sensitivity" type="range" min="1" max="10" step="0.5" value={phone.translationScale} disabled={phone.recording} onChange={event => phoneCamera.setTranslationScale(Number(event.target.value))} />
        <small>{phone.recording ? 'Finish the take to change sensitivity.' : `10 cm on your phone = ${10 * phone.translationScale} cm in the scene.`}</small>
      </label>
      {phone.recording ? <button className="button phone-record" onClick={phoneCamera.stop}><Square size={15} />Stop & save · {phone.elapsed.toFixed(1)}s</button>
        : <button className="button phone-record" disabled={!phone.aligned || phone.paused} onClick={phoneCamera.record}><Circle size={15} />Record camera move</button>}
      <button className="button secondary" disabled={!phone.aligned} onClick={phone.paused ? phoneCamera.resume : phoneCamera.pause}>
        {phone.paused ? <Play size={15} /> : <Pause size={15} />}{phone.paused ? 'Resume camera' : 'Pause camera'}
      </button>
      {phone.aligned && !phone.recording && <button className="button secondary" onClick={phoneCamera.stop}>Return to editing</button>}
      <button className="button secondary" onClick={phoneCamera.disconnect}>Disconnect phone</button>
      {debug && phone.connected && <section className="phone-latency" aria-label="Position tracking">
        <h3>Position tracking</h3>
        <dl><dt>Received phone XYZ (m)</dt><dd><output aria-label="Received phone position">{xyz(positions.received)}</output></dd>
          <dt>Mapped camera XYZ (m)</dt><dd><output aria-label="Mapped camera position">{xyz(positions.mapped)}</output></dd></dl>
        <p className="small-copy">Updates live without recording. Mapped position appears after Set starting pose. Stale readings clear after half a second. The inspector shows saved keys, not this live camera position.</p>
      </section>}
      {phone.connected && <section className="phone-latency" aria-label="Preview settings">
        <label className="field-label">Preview mode<select aria-label="Preview mode" value={preview.mode} onChange={event => void phoneCamera.configurePreview(event.target.value as 'jpeg' | 'webrtc', preview.fps)}>
          <option value="jpeg">JPEG baseline · 480×270 / 6 fps</option><option value="webrtc">WebRTC · 960×540</option>
        </select></label>
        {preview.mode === 'webrtc' && <label className="field-label">Target frame rate<select aria-label="Preview frame rate" value={preview.fps} onChange={event => void phoneCamera.configurePreview('webrtc', Number(event.target.value) as 30 | 60)}><option value={60}>60 fps</option><option value={30}>30 fps</option></select></label>}
        <p className="small-copy" role="status">{preview.status}</p>
        <button className="button secondary" onClick={() => void phoneCamera.configurePreview(preview.mode, preview.fps)}>Retry preview</button>
      </section>}
      {debug && phone.connected && <section className="phone-latency" aria-label="Latency experiment">
        <h3>Latency experiment</h3>
        <dl><dt>Phone input</dt><dd>{preview.poseHz.toFixed(1)} poses/s</dd><dt>Desktop receive → render</dt><dd>{ms(preview.receiveToRenderMs)}</dd>
          <dt>Canvas copy / capture rate</dt><dd>{ms(preview.copyMs)} / {preview.captureFps.toFixed(1)} fps</dd>
          <dt>Phone decoded video</dt><dd>{diagnostic?.fps.toFixed(1) ?? '—'} fps</dd><dt>Dropped / jitter / RTC RTT</dt><dd>{diagnostic?.dropped ?? '—'} / {ms(diagnostic?.jitterMs)} / {ms(diagnostic?.rttMs)}</dd>
          <dt>Pulse median / p95</dt><dd>{ms(latencyPercentile(diagnostic?.samples ?? [], .5))} / {ms(latencyPercentile(diagnostic?.samples ?? [], .95))}</dd>
        </dl>
        <p className="small-copy">{diagnostic?.samples.length ?? 0}/20 pulses returned · {diagnostic?.timedOut ?? 0} timed out. {diagnostic?.path}</p>
        <p className="small-copy">Run 20 pulses on the phone, then export before switching modes. This estimates control → decoded frame delay, not physical motion → screen latency.</p>
        <button className="button secondary" disabled={!diagnostic || !diagnostic.samples.length && !diagnostic.timedOut} onClick={exportResults}>Export latency results</button>
      </section>}
    </>}
    {phone.message && <p className="panel-copy" role="status">{phone.message}</p>}
    <p className="panel-copy small-copy">Takes start at the playhead and stop at the next camera block or scene end. Tracking loss saves the captured portion. Open Animate to replay and stretch the block.</p>
  </aside>;
}
