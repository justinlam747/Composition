import { z } from 'zod';
import type { PhonePairing } from './phoneProtocol';

export function isLocalPhoneAddress(address: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):([1-9]\d{0,4})$/.exec(address);
  if (!match || match[0] !== address || match.slice(1, 5).some(part => Number(part) > 255 || String(Number(part)) !== part) || Number(match[5]) > 65535) return false;
  const a = Number(match[1]), b = Number(match[2]);
  return a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
    || a === 169 && b === 254 || a === 100 && b >= 64 && b <= 127;
}

export const phonePairingCodeSchema = z.object({
  type: z.literal('composition-camera'), version: z.literal(1),
  address: z.string().max(21).refine(isLocalPhoneAddress, 'Choose a local IPv4 address and port.'),
  code: z.string().length(8).regex(/^[0-9]{8}$/), expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();

export function phonePairingCode(pairing: PhonePairing, address: string, now = Date.now()) {
  if (!pairing.addresses.includes(address)) throw new Error('Choose an address from this pairing session.');
  if (pairing.expiresAt <= now) throw new Error('Pairing code expired. Generate a new code.');
  return JSON.stringify(phonePairingCodeSchema.parse({ type: 'composition-camera', version: 1,
    address, code: pairing.code, expiresAt: pairing.expiresAt }));
}
