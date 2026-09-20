import { describe, expect, it } from 'vitest';
import { HUMANOID_ID, makeProject, motionSceneTime, parseProject, putKey, sample, validateProject } from '../src/core/project';
import { animationFromTracks, insertClip, splitClip, transformClip } from '../src/core/clips';
import { studio } from '../src/core/store';

function motion() {
  return putKey(putKey({ ...makeProject(), duration: 4 }, 'model', 'position', 0, [0, 0, 0], 'linear'), 'model', 'position', 4, [4, 8, -4], 'linear');
}

describe('value graph handles', () => {
  it('bends a linear value curve into a flat landing without changing other axes', () => {
    const p = motion();
    p.tracks[0].keys[1].valueHandles = { in: [.6, null, null] };
    expect(sample(p, 'model', 'position', 2)[0]).toBeGreaterThan(2);
    expect(sample(p, 'model', 'position', 2).slice(1)).toEqual([4, -2]);
    const landingSlope = (4 - sample(p, 'model', 'position', 3.999)[0]) / .001;
    expect(landingSlope).toBeLessThan(.002);
    expect(sample(p, 'model', 'position', 4)).toEqual([4, 8, -4]);
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it('supports descending, constant, and signed rotation values', () => {
    let p = putKey(putKey(motion(), 'head', 'rotation', 0, [0, 0, 0], 'linear'), 'head', 'rotation', 4, [0, 360, 0]);
    p.tracks[0].keys[1].valueHandles = { in: [null, null, .8] };
    p.tracks[1].keys[1].valueHandles = { in: [.5, .5, null] };
    expect(sample(p, 'model', 'position', 2)[2]).toBeLessThan(-2);
    expect(sample(p, 'head', 'rotation', 2)[0]).toBe(0);
    expect(sample(p, 'head', 'rotation', 2)[1]).toBeGreaterThan(180);
    expect(sample(p, 'head', 'rotation', 4)[1]).toBe(360);
  });
  it('rejects malformed or non-finite handle influences', () => {
    for (const valueHandles of [null, { in: [] }, { out: [NaN, null, null] }, { in: [-1, null, null] }, { in: [1.01, null, null] }, { out: [0, null, null] }]) {
      const p = motion();
      Object.assign(p.tracks[0].keys[1], { valueHandles });
      expect(() => validateProject(p)).toThrow();
    }
  });
  it('preserves handle playback through stretched and split cached clips', () => {
    const p = motion(); p.tracks[0].keys[1].valueHandles = { in: [.75, null, null] };
    const asset = animationFromTracks(p, HUMANOID_ID, 'Landing', 'edited');
    const inserted = insertClip({ ...makeProject(), duration: 10 }, asset, HUMANOID_ID, 1);
    const stretched = transformClip(inserted, inserted.clips![0].id, 1, 6);
    const split = splitClip(stretched, stretched.clips![0].id, 4);
    for (let frame = 0; frame <= 180; frame++) {
      const time = frame / 30;
      expect(sample(stretched, 'model', 'position', 1 + time)[0]).toBeCloseTo(sample(p, 'model', 'position', time / 1.5)[0], 7);
      sample(split, 'model', 'position', 1 + time).forEach((value, axis) => expect(value).toBeCloseTo(sample(stretched, 'model', 'position', 1 + time)[axis], 7));
    }
  });
  it('groups handle drags into one undo and edits only the chosen axis', () => {
    const p = motion(), id = p.tracks[0].keys[1].id;
    studio.openProject(p); studio.patch({ timelineMode: 'value' }); studio.selectValueKey(id);
    studio.begin(); studio.setValueHandle(id, 0, 'in', .4); studio.setValueHandle(id, 0, 'in', .7); studio.end();
    expect(studio.get().undoCount).toBe(1);
    expect(studio.get().project.tracks[0].keys[1].valueHandles).toEqual({ in: [.7, null, null] });
    studio.undo(); expect(studio.get().project).toEqual(p);
    studio.redo(); expect(sample(studio.get().project, 'model', 'position', 2)[0]).toBeGreaterThan(2);
    studio.updateValueKey(id, 3, 0, 5);
    expect(studio.get().project.tracks[0].keys[1]).toMatchObject({ time: 3, value: [5, 8, -4], valueHandles: { in: [.7, null, null] } });
    studio.resetValueHandles(id, 0);
    expect(sample(studio.get().project, 'model', 'position', 1.5)[0]).toBeCloseTo(2.5);
  });
  it('keeps the exact source frame when changing a value under nonlinear retiming', () => {
    const p = putKey(motion(), 'model', 'position', 91 / 30, [3, 0, 0]);
    p.velocities = [{ objectId: HUMANOID_ID, duration: 4, keys: [{ id: 'a', time: 0, speed: 4 }, { id: 'b', time: 4, speed: 0 }] }];
    const key = p.tracks[0].keys[1], time = motionSceneTime(p, key.time, HUMANOID_ID);
    studio.openProject(p); studio.patch({ timelineMode: 'value' }); studio.updateValueKey(key.id, time, 0, 7);
    studio.updateValueKey(key.id, time, 0, 8);
    expect(studio.get().project.tracks[0].keys[1]).toMatchObject({ id: key.id, time: 91 / 30, value: [8, 0, 0] });
    expect(studio.get().project.tracks[0].keys).toHaveLength(3);
  });
  it('restores the exact source frame when a compressed-clip drag returns to its origin', () => {
    const p = putKey(motion(), 'model', 'position', 1, [1, 0, 0]);
    const inserted = insertClip({ ...makeProject(), duration: 4 }, animationFromTracks(p, HUMANOID_ID, 'Move', 'edited'), HUMANOID_ID, 0);
    const project = transformClip(inserted, inserted.clips![0].id, 0, 1), clip = project.clips![0], key = clip.tracks[0].keys[1];
    studio.openProject(project); studio.selectClip(clip.id, true); studio.patch({ timelineMode: 'value' }); studio.begin();
    studio.updateValueKey(key.id, .5, 0, 1); studio.updateValueKey(key.id, .25, 0, 1); studio.end();
    expect(studio.get().project.clips![0].tracks[0].keys.find(value => value.id === key.id)!.time).toBe(1);
  });
  it('does not create history or notify subscribers for repeated handle-limit edits', () => {
    const p = motion(), id = p.tracks[0].keys[1].id;
    studio.openProject(p); studio.setValueHandle(id, 0, 'in', 1);
    const before = studio.get(); let notifications = 0;
    const unsubscribe = studio.subscribe(() => notifications++);
    try { studio.setValueHandle(id, 0, 'in', 2); studio.selectValueKey(id); } finally { unsubscribe(); }
    expect(studio.get()).toBe(before); expect(notifications).toBe(0);
  });
  it('does not edit another scope when a manual key overlaps an animation block', () => {
    const p = motion(), id = p.tracks[0].keys[1].id;
    const project = insertClip(p, animationFromTracks(p, HUMANOID_ID, 'Move', 'edited'), HUMANOID_ID, 1);
    for (const edit of [() => studio.setValueHandle(id, 0, 'in', .5), () => studio.updateValueKey(id, 4, 0, 5), () => studio.resetValueHandles(id, 0)]) {
      studio.openProject(project); studio.patch({ timelineMode: 'value' });
      expect(edit).not.toThrow(); expect(studio.get().project).toEqual(project); expect(studio.get().undoCount).toBe(0);
    }
  });
});
