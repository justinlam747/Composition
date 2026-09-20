import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PhonePairing } from '../core/phoneProtocol';
import { isLocalPhoneAddress, phonePairingCode } from '../core/phonePairing';

export default function PhonePairingCard({ pairing, connected, onRenew }: { pairing: PhonePairing; connected: boolean; onRenew: () => void }) {
  const [selected, setSelected] = useState('');
  const [now, setNow] = useState(Date.now);
  const addresses = pairing.addresses.filter(isLocalPhoneAddress);
  const address = addresses.includes(selected) ? selected : addresses[0];
  const expired = now >= pairing.expiresAt;
  useEffect(() => {
    setNow(Date.now());
    if (connected) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing.id, connected]);
  if (connected) return <p className="panel-copy small-copy">iPhone paired. Camera images stay on your phone.</p>;
  return <div className="phone-pairing">
    {expired ? <p role="status">Pairing code expired. Generate a new code to connect.</p> : <>
      {address && <>
        <div className="phone-pairing-qr"><QRCodeSVG value={phonePairingCode(pairing, address, now)} size={216} marginSize={4} level="M" role="img" aria-label="iPhone pairing QR code" /></div>
        <p className="panel-copy small-copy">Open Composition Camera on your iPhone and tap <b>Scan pairing code</b>.</p>
        <label className="field-label">Connection address<select aria-label="Pairing connection address" value={address} onChange={event => setSelected(event.target.value)}>
          {addresses.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </>}
      <span className="field-label">Manual pairing code</span><strong>{pairing.code}</strong>
      {!address && <><span className="field-label">Computer address</span>{pairing.addresses.length ? pairing.addresses.map(value => <p key={value}>{value}</p>) : <p>Connect this computer to a local network first.</p>}</>}
      <p className="panel-copy small-copy">Use the same Wi-Fi network or a working USB network. If several addresses appear, choose one your phone can reach. Expires in {Math.max(1, Math.ceil((pairing.expiresAt - now) / 60000))} min.</p>
    </>}
    <button className="button secondary" onClick={onRenew}>New pairing code</button>
  </div>;
}
