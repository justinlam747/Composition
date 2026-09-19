import { useEffect, useState } from 'react';
import { Circle, Smartphone, Square, X } from 'lucide-react';
import { phoneCamera, usePhoneCamera } from '../scene/phoneCamera';

export default function PhoneCameraPanel({ onClose }: { onClose: () => void }) {
  const phone = usePhoneCamera();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => { let active = true;
    fetch('/api/phone').then(response => response.json()).then(value => { if (active) setEnabled(value.enabled); }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; phoneCamera.disconnect(); };
  }, []);
  return <aside className="assistant-panel" aria-label="Phone camera">
    <div className="panel-heading"><div><span className="eyebrow">Move to direct</span><h2><Smartphone size={19} /> Phone camera</h2></div><button className="icon-button" aria-label="Close phone camera" onClick={onClose}><X size={19} /></button></div>
    <p className="panel-copy">Use your iPhone to move through the shot. Your subject stays in place while you walk closer, pull back, or pan.</p>
    {enabled === false && <p className="inline-error">The phone bridge is offline. Follow the <a href="/phone-setup.html" target="_blank" rel="noreferrer">setup guide</a> to start it and install the iPhone companion.</p>}
    {!phone.pairing ? <button className="button primary" disabled={!enabled} onClick={() => void phoneCamera.pair()}>Pair iPhone</button> : <>
      <div className="phone-pairing"><span className="field-label">Computer address</span>{phone.pairing.addresses.length ? phone.pairing.addresses.map(address => <p key={address}>{address}</p>) : <p>Connect this computer to Wi-Fi first.</p>}<span className="field-label">Pairing code</span><strong>{phone.pairing.code}</strong><p className="panel-copy small-copy">Use the same Wi-Fi network. The code expires after 10 minutes if unused.</p></div>
      <p className="phone-tracking" role="status"><span className={phone.tracking === 'normal' ? 'saved-dot' : ''} />{phone.connected ? phone.tracking === 'normal' ? 'Tracking ready' : 'Finding the room…' : 'Waiting for iPhone'}</p>
      <button className="button secondary" disabled={phone.tracking !== 'normal' || phone.recording} onClick={() => void phoneCamera.align()}>Set starting pose</button>
      <p className="panel-copy small-copy">Frame your starting view in the editor first, then hold the phone comfortably and set its starting pose. One real meter equals one scene meter.</p>
      {phone.recording ? <button className="button primary" onClick={phoneCamera.stop}><Square size={15} />Stop & save · {phone.elapsed.toFixed(1)}s</button>
        : <button className="button primary" disabled={!phone.aligned} onClick={phoneCamera.record}><Circle size={15} />Record camera move</button>}
      {phone.aligned && !phone.recording && <button className="button secondary" onClick={phoneCamera.stop}>Return to editing</button>}
      <button className="button secondary" onClick={phoneCamera.disconnect}>Disconnect phone</button>
    </>}
    {phone.message && <p className="panel-copy" role="status">{phone.message}</p>}
    <p className="panel-copy small-copy">Takes start at the playhead and stop at the next camera block or scene end. Tracking loss saves the captured portion. Open Animate to replay and stretch the block.</p>
  </aside>;
}
