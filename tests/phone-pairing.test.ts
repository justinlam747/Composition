import { describe, expect, it } from 'vitest';
import { isLocalPhoneAddress, phonePairingCode, phonePairingCodeSchema } from '../src/core/phonePairing';

describe('phone QR pairing', () => {
  const pairing = { id: 'private-editor-session-token', code: '12345678', addresses: ['192.168.2.20:3003', '169.254.20.144:3003'], expiresAt: 2000 };
  it('encodes only the selected local address, temporary code, version and expiration', () => {
    const payload = phonePairingCode(pairing, pairing.addresses[1], 1000);
    expect(phonePairingCodeSchema.parse(JSON.parse(payload))).toEqual({ type: 'composition-camera', version: 1,
      address: '169.254.20.144:3003', code: '12345678', expiresAt: 2000 });
    expect(payload).not.toContain(pairing.id);
    expect(payload).not.toContain(pairing.addresses[0]);
  });
  it('rejects expired or foreign pairing addresses', () => {
    expect(() => phonePairingCode(pairing, pairing.addresses[0], 2000)).toThrow(/expired/);
    expect(() => phonePairingCode(pairing, '192.168.2.50:3003', 1000)).toThrow(/this pairing session/);
    expect(() => phonePairingCode({ ...pairing, code: '1234' }, pairing.addresses[0], 1000)).toThrow();
  });
  it('accepts private LAN, USB link-local and shared VPN addresses with valid ports', () => {
    for (const value of ['10.0.0.1:1', '172.16.0.2:3003', '172.31.255.254:65535', '192.168.0.2:3003', '169.254.20.144:3003', '100.64.0.1:3003', '100.127.0.1:3003']) {
      expect(isLocalPhoneAddress(value), value).toBe(true);
    }
  });
  it('rejects public hosts, loopback, URL credentials, paths and malformed addresses', () => {
    for (const value of ['127.0.0.1:3003', '8.8.8.8:3003', '172.32.0.1:3003', '100.128.0.1:3003', '0.0.0.0:3003',
      'computer.local:3003', 'http://192.168.0.1:3003', '192.168.0.1:0', '192.168.0.1:65536', '192.168.0.1:03003',
      '192.168.0.256:3003', '192.168.00.1:3003', 'user@192.168.0.1:3003', '192.168.0.1:3003/phone', '[::1]:3003', '192.168.0.1:3003\n']) {
      expect(isLocalPhoneAddress(value), value).toBe(false);
    }
    const valid = JSON.parse(phonePairingCode(pairing, pairing.addresses[0], 1000));
    for (const patch of [{ type: 'other' }, { version: 2 }, { code: '１２３４５６７８' }, { code: '12345678\n' }, { expiresAt: Infinity }, { expiresAt: -1 }, { extra: true }]) {
      expect(phonePairingCodeSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});
