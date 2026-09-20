export interface VelocityKey { id: string; time: number; speed: number }
export interface VelocityTrack { objectId: string; keys: VelocityKey[]; duration?: number }
export interface VelocityWindow { start: number; end: number; from: number; to: number }
export const MAX_SPEED = 4;

// Speeds are relative weights. Their integral redistributes motion within the
// authored duration, keeping its first and last poses synchronized to the take.
export function velocityAt(keys: VelocityKey[] | undefined, time: number): number {
  if (!keys?.length) return 1;
  if (time <= keys[0].time) return keys[0].speed;
  const index = keys.findIndex(key => key.time > time);
  if (index < 0) return keys.at(-1)!.speed;
  const a = keys[index - 1], b = keys[index];
  return a.speed + (b.speed - a.speed) * (time - a.time) / (b.time - a.time);
}

function area(keys: VelocityKey[], end: number) {
  let total = 0, previous = 0, speed = velocityAt(keys, 0);
  for (const key of keys) {
    if (key.time <= 0) continue;
    if (key.time >= end) break;
    total += (key.time - previous) * (speed + key.speed) / 2;
    previous = key.time; speed = key.speed;
  }
  return total + (end - previous) * (speed + velocityAt(keys, end)) / 2;
}

export function velocityTime(keys: VelocityKey[] | undefined, time: number, duration: number, window?: VelocityWindow): number {
  const { start, end, from, to } = window ?? { start: 0, end: duration, from: 0, to: duration };
  if (window && time > end) return Math.min(duration, to + time - end);
  if (window && time < start) return Math.max(0, from + time - start);
  const at = Math.max(start, Math.min(end, time));
  if (!keys?.length) return from + (at - start) / (end - start) * (to - from);
  const baseline = area(keys, start), total = area(keys, end) - baseline;
  return total > 1e-9 ? from + (area(keys, at) - baseline) / total * (to - from) : from;
}

export function velocitySceneTime(keys: VelocityKey[] | undefined, time: number, duration: number, window?: VelocityWindow): number {
  const { start, end, from, to } = window ?? { start: 0, end: duration, from: 0, to: duration };
  if (time < from) return start + time - from;
  if (time > to) return end + time - to;
  if (time <= from || time >= to || !keys?.length) return start + (time - from) / Math.max(1e-9, to - from) * (end - start);
  let low = start, high = end;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (velocityTime(keys, middle, duration, window) < time) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

export function validateVelocityKeys(input: unknown, duration: number): asserts input is VelocityKey[] | undefined {
  if (input === undefined) return;
  if (!Array.isArray(input) || input.length > 1000) throw new Error('Invalid velocity keys.');
  const ids = new Set<string>();
  let previous = -1;
  for (const key of input) {
    if (!key || typeof key.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(key.id) || ids.has(key.id) ||
      !Number.isFinite(key.time) || key.time < 0 || key.time > duration + 1e-8 || key.time <= previous ||
      !Number.isFinite(key.speed) || key.speed < 0 || key.speed > MAX_SPEED) throw new Error('Invalid velocity key.');
    previous = key.time; ids.add(key.id);
  }
}
