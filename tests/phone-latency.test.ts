import { describe, expect, it } from 'vitest';
import { desktopSignalSchema, phoneMessageSchema } from '../src/core/phoneProtocol';
import { drawLatencyMarker, LATENCY_MARKER, latencyPercentile } from '../src/core/phoneLatency';

const streamId = 'de346203-e0f9-4a58-8af8-8469b0193206';
describe('phone latency experiment', () => {
  it('separates desktop offers from phone answers and bounds signaling', () => {
    const signal = { type: 'signal', version: 1, streamId, kind: 'answer', sdp: 'v=0' };
    expect(phoneMessageSchema.safeParse(signal).success).toBe(true);
    expect(desktopSignalSchema.safeParse(signal).success).toBe(false);
    expect(phoneMessageSchema.safeParse({ ...signal, kind: 'offer' }).success).toBe(false);
    expect(desktopSignalSchema.safeParse({ ...signal, kind: 'offer' }).success).toBe(true);
    expect(phoneMessageSchema.safeParse({ ...signal, sdp: 'a'.repeat(64001) }).success).toBe(false);
    expect(phoneMessageSchema.safeParse({ type: 'pulse', version: 1, streamId, id: 65536 }).success).toBe(false);
  });
  it('encodes a pulse in pixels with a fixed header and a full 16-bit ID', () => {
    const colors: string[] = [];
    const context = { fillStyle: '', fillRect() { colors.push(this.fillStyle); } };
    drawLatencyMarker(context as unknown as CanvasRenderingContext2D, 0xa391);
    expect(colors).toHaveLength(LATENCY_MARKER.cells);
    expect(colors.slice(0, 2)).toEqual(['#fff', '#000']);
    expect(colors.slice(2).reduce((value, color, bit) => value | (color === '#fff' ? 1 << bit : 0), 0)).toBe(0xa391);
  });
  it('computes nearest-rank statistics without changing the samples', () => {
    const samples = [30, 5, 90, 20];
    expect(latencyPercentile([], .5)).toBeNull();
    expect(latencyPercentile(samples, .5)).toBe(20);
    expect(latencyPercentile(samples, .95)).toBe(90);
    expect(samples).toEqual([30, 5, 90, 20]);
  });
});
