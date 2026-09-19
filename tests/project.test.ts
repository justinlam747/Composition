import { describe, expect, it } from 'vitest';
import { BONES, makeProject, moveKey, parseProject, putKey, sample, seedIdle, toQuaternion } from '../src/core/project';

describe('fixed rig animation', () => {
  it('remains static with no motion keys', () => {
    const p = makeProject();
    for (const b of BONES) expect(sample(p, b.id, 'rotation', 0)).toEqual(sample(p, b.id, 'rotation', 4));
    expect(sample(p, 'model', 'scale', 2)).toEqual([1, 1, 1]);
  });
  it('seeds a seamless idle into known bone tracks and preserves model movement', () => {
    const p = seedIdle(putKey(makeProject(), 'model', 'position', 1, [2, 0, 0]));
    expect(sample(p, 'model', 'position', 1)).toEqual([2, 0, 0]);
    expect(p.tracks.filter(t => t.target !== 'model').length).toBeGreaterThan(3);
    for (const t of p.tracks.filter(t => t.target !== 'model')) {
      expect(BONES.some(b => b.id === t.target)).toBe(true);
      expect(t.keys[0].value).toEqual(t.keys.at(-1)!.value);
    }
    expect(sample(p, 'head', 'rotation', 0)).not.toEqual(sample(p, 'head', 'rotation', 2.5));
  });
  it('edits generated keys directly without leaving a hidden animation underneath', () => {
    const p = seedIdle(makeProject());
    const count = p.tracks.find(t => t.target === 'head')!.keys.length;
    const edited = putKey(p, 'head', 'rotation', 2.5, [25, 0, 0]);
    expect(edited.tracks.find(t => t.target === 'head')!.keys.length).toBe(count);
    expect(sample(edited, 'head', 'rotation', 2.5)[0]).toBeCloseTo(25);
    expect(sample({ ...edited, tracks: [] }, 'head', 'rotation', 2.5)).toEqual([0, 0, 0]);
  });
  it('interpolates position and preserves signed numeric rotation turns', () => {
    let p = putKey(makeProject(), 'model', 'position', 0, [0, 0, 0], 'linear');
    p = putKey(p, 'model', 'position', 2, [4, 0, 0]);
    expect(sample(p, 'model', 'position', 1)).toEqual([2, 0, 0]);
    p = putKey(p, 'head', 'rotation', 0, [0, 170, 0], 'linear');
    p = putKey(p, 'head', 'rotation', 2, [0, -170, 0]);
    const midpoint = toQuaternion(sample(p, 'head', 'rotation', 1));
    expect(midpoint.angleTo(toQuaternion([0, 0, 0]))).toBeCloseTo(0);
    p = putKey(p, 'head', 'rotation', 0, [0, 0, 0], 'linear');
    p = putKey(p, 'head', 'rotation', 2, [0, 360, 0]);
    expect(sample(p, 'head', 'rotation', 1)).toEqual([0, 180, 0]);
  });
  it('snaps keys to frames and resolves retiming collisions deterministically', () => {
    let p = putKey(makeProject(), 'model', 'position', .99, [1, 0, 0]);
    p = putKey(p, 'model', 'position', 2, [2, 0, 0]);
    const id = p.tracks[0].keys[0].id;
    const moved = moveKey(p, id, 2);
    expect(moved.tracks[0].keys).toHaveLength(1);
    expect(moved.tracks[0].keys[0]).toMatchObject({ id, time: 2, value: [1, 0, 0] });
    expect(p.tracks[0].keys).toHaveLength(2);
  });
  it('round-trips shared scene data and rejects invalid rigs and keys', () => {
    const p = seedIdle(makeProject());
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(() => parseProject(JSON.stringify({ ...p, rig: 'unknown' }))).toThrow();
    const bad = structuredClone(p); bad.tracks[0].target = 'inventedBone';
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
    bad.tracks[0].target = 'spine'; bad.tracks[0].keys[0].time = -1;
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
    expect(() => parseProject(JSON.stringify({ ...p, tracks: [...p.tracks, p.tracks[0]] }))).toThrow();
  });
});
