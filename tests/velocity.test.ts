import { describe, expect, it } from 'vitest';
import { velocityAt, velocityTime, velocitySceneTime, validateVelocityKeys, type VelocityKey } from '../src/core/velocity';
import { CAMERA_ID, HUMANOID_ID, clipSceneTime, clipSourceTime, makeCamera, makeObject, makeProject, parseProject, putKey, sample, validateProject } from '../src/core/project';
import { animationFromClip, animationFromTracks, insertClip, splitClip, transformClip } from '../src/core/clips';
import { sceneSignature } from '../src/core/proposals';

const ramp: VelocityKey[] = [{ id: 'slow', time: 0, speed: 0 }, { id: 'fast', time: 4, speed: 2 }];
function motion() {
  let project = putKey({ ...makeProject(), duration: 4, camera: makeCamera() }, 'model', 'position', 0, [0, 0, 0], 'linear');
  project = putKey(project, 'model', 'position', 4, [8, 0, 0]);
  project = putKey(project, 'head', 'rotation', 0, [0, 0, 0], 'linear');
  return putKey(project, 'head', 'rotation', 4, [0, 360, 0]);
}

describe('velocity keys', () => {
  it('integrates speed keys independently of pose keys and preserves duration', () => {
    expect(velocityAt(ramp, 2)).toBe(1);
    expect(velocityTime(ramp, 2, 4)).toBeCloseTo(1);
    expect(velocityTime(ramp, 0, 4)).toBe(0);
    expect(velocityTime(ramp, 4, 4)).toBe(4);
    expect(velocityTime(undefined, 2, 4)).toBe(2);
    expect(velocityTime([{ id: 'one', time: 1, speed: 3 }], 2, 4)).toBe(2);
    for (let time = 0; time <= 4; time += .1) expect(velocitySceneTime(ramp, velocityTime(ramp, time, 4), 4)).toBeCloseTo(time, 7);
  });
  it('holds through zero-speed intervals and all-zero timelines without NaN', () => {
    const keys = [{ id: 'a', time: 0, speed: 1 }, { id: 'b', time: 1, speed: 0 }, { id: 'c', time: 3, speed: 0 }, { id: 'd', time: 4, speed: 1 }];
    expect(velocityTime(keys, 1, 4)).toBe(velocityTime(keys, 3, 4));
    expect(velocityTime([{ id: 'stop', time: 0, speed: 0 }], 4, 4)).toBe(0);
  });
  it('retimes all properties of only the selected object and invalidates its guide', () => {
    const source = motion(), box = makeObject('box');
    const project = { ...source, objects: [...source.objects, box], velocities: [{ objectId: HUMANOID_ID, keys: ramp }] };
    expect(sample(project, 'model', 'position', 2)[0]).toBeCloseTo(2);
    expect(sample(project, 'head', 'rotation', 2)[1]).toBeCloseTo(90);
    expect(sample(project, 'model', 'position', 2, box.id)).toEqual(box.position);
    expect(sample(project, 'model', 'position', 2, CAMERA_ID)).toEqual(project.camera!.position);
    expect(project.tracks).toEqual(source.tracks);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(sceneSignature(project)).not.toBe(sceneSignature(source));
  });
  it('keeps retimed clips identical through stretching, splitting, caching, and reload', () => {
    const source = { ...motion(), velocities: [{ objectId: HUMANOID_ID, keys: ramp }] };
    const asset = animationFromTracks(source, HUMANOID_ID, 'Ramp', 'edited');
    let project = insertClip({ ...makeProject(), duration: 10 }, asset, HUMANOID_ID, 1);
    project = transformClip(project, project.clips![0].id, 1, 6);
    const clip = project.clips![0];
    expect(clipSceneTime(clip, clipSourceTime(clip, 4))).toBeCloseTo(4);
    const split = splitClip(project, clip.id, 3.3);
    for (let frame = 0; frame <= 300; frame++) {
      expect(sample(split, 'model', 'position', frame / 30)[0]).toBeCloseTo(sample(project, 'model', 'position', frame / 30)[0], 7);
    }
    const right = split.clips![1], cached = animationFromClip(split, right);
    const replay = insertClip({ ...makeProject(), duration: 10 }, cached, HUMANOID_ID, 0);
    for (let frame = 0; frame < 100; frame++) expect(sample(replay, 'head', 'rotation', frame / 30)[1]).toBeCloseTo(sample(split, 'head', 'rotation', right.start + frame / 30)[1], 6);
    expect(parseProject(JSON.stringify(split))).toEqual(split);
    replay.clips![0].velocityKeys![0].speed = 4;
    expect(right.velocityKeys![0].speed).toBe(0);
  });
  it('preserves manual timing when another animation extends the scene and when cached', () => {
    const source = { ...motion(), velocities: [{ objectId: HUMANOID_ID, keys: ramp, duration: 4 }] }, box = makeObject('box');
    const boxScene = { ...makeProject(), duration: 4, objects: [box] };
    const asset = animationFromTracks(boxScene, box.id, 'Box', 'edited');
    const extended = insertClip({ ...source, objects: [...source.objects, box] }, asset, box.id, 4);
    expect(extended.duration).toBe(8);
    for (const time of [1, 2, 4, 6]) expect(sample(extended, 'model', 'position', time)).toEqual(sample(source, 'model', 'position', time));
    const cached = animationFromTracks(extended, HUMANOID_ID, 'Manual', 'edited');
    const replay = insertClip({ ...makeProject(), duration: 8 }, cached, HUMANOID_ID, 0);
    for (const time of [1, 2, 4, 6]) expect(sample(replay, 'model', 'position', time)).toEqual(sample(extended, 'model', 'position', time));
  });
  it('validates velocity keys in manual scenes, camera tracks and animation assets', () => {
    for (const bad of [null, [{ id: 'a', time: -1, speed: 1 }], [{ id: 'a', time: 0, speed: NaN }], [{ id: 'a', time: 0, speed: 5 }], [ramp[1], ramp[0]], [ramp[0], ramp[0]]]) {
      expect(() => validateVelocityKeys(bad, 4)).toThrow();
    }
    const project = { ...motion(), velocities: [{ objectId: CAMERA_ID, keys: ramp }] };
    expect(validateProject(project)).toEqual(project);
    expect(() => validateProject({ ...project, velocities: [{ objectId: 'missing', keys: ramp }] })).toThrow();
    expect(() => validateProject({ ...project, duration: 2 })).toThrow();
    const asset = animationFromTracks(motion(), HUMANOID_ID, 'Invalid', 'edited');
    expect(() => insertClip(makeProject(), { ...asset, velocityKeys: [{ id: 'a', time: 0, speed: Infinity }] }, HUMANOID_ID, 0)).toThrow();
  });
});
