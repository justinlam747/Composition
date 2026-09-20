import type { Keyframe } from './project';

export type Axis = 0 | 1 | 2;
export type HandleSide = 'in' | 'out';
export type Influences = [number | null, number | null, number | null];
export type ValueHandles = Partial<Record<HandleSide, Influences>>;

const cubic = (a: number, b: number, c: number, d: number, t: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;

// A handle's length is a fraction of the adjacent interval. Its value is locked
// to its key, giving that endpoint zero slope. Untouched axes keep legacy motion.
export function valueProgress(a: Keyframe, b: Keyframe, axis: Axis, time: number): number | undefined {
  const outgoing = a.valueHandles?.out?.[axis], incoming = b.valueHandles?.in?.[axis];
  if (outgoing == null && incoming == null) return undefined;
  const x1 = outgoing ?? 1 / 3, x2 = 1 - (incoming ?? 1 / 3);
  const power = a.easePower ?? 2;
  const startSlope = a.ease === 'linear' ? 1 : a.ease === 'ease-out' ? power : 0;
  const endSlope = a.ease === 'linear' ? 1 : a.ease === 'ease-in' ? power : 0;
  const y1 = outgoing != null ? 0 : Math.min(1, startSlope / 3);
  const y2 = incoming != null ? 1 : Math.max(0, 1 - endSlope / 3);
  const progress = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
  if (progress === 0 || progress === 1) return progress;
  let low = 0, high = 1;
  for (let i = 0; i < 40; i++) {
    const t = (low + high) / 2;
    if (cubic(0, x1, x2, 1, t) < progress) low = t; else high = t;
  }
  return cubic(0, y1, y2, 1, (low + high) / 2);
}

export function validateValueHandles(input: unknown) {
  if (input === undefined) return;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid value graph handles.');
  for (const [side, values] of Object.entries(input)) {
    if (!['in', 'out'].includes(side) || !Array.isArray(values) || values.length !== 3 ||
      !values.every(value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= .01 && value <= 1)) {
      throw new Error('Value handle influences must be between 0.01 and 1.');
    }
  }
}
