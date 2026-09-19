import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { alignPhone, cameraTake, type MotionSample } from '../src/core/phoneMotion';
import { phonePoseSchema, type PhonePose } from '../src/core/phoneProtocol';
import { makeProject, makeCamera, CAMERA_ID, sample, toQuaternion, parseProject } from '../src/core/project';
import { insertClip, transformClip } from '../src/core/clips';

const pose = (changes: Partial<PhonePose> = {}): PhonePose => ({ type: 'pose', version: 1, seq: 1, time: 1, tracking: 'normal', position: [0, 0, 0], quaternion: [0, 0, 0, 1], ...changes });
describe('phone camera motion', () => {
  it('aligns the starting phone pose without a jump and retains metric translation and rotation', () => {
    const start = pose({ position: [4, 1, 2], quaternion: toQuaternion([0, 35, 0]).toArray() });
    const camera = makeCamera(), map = alignPhone(start, camera);
    expect(map(start).position).toEqual(camera.position);
    expect(new Quaternion(...map(start).quaternion).angleTo(toQuaternion(camera.rotation))).toBeCloseTo(0);
    const worldForward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...start.quaternion));
    const next = map(pose({ position: new Vector3(...start.position).add(worldForward).toArray(), quaternion: start.quaternion }));
    const expected = new Vector3(...camera.position).add(new Vector3(0, 0, -1).applyQuaternion(toQuaternion(camera.rotation)));
    expect(new Vector3(...next.position).distanceTo(expected)).toBeLessThan(1e-8);
    expect(new Vector3(...next.position).distanceTo(new Vector3(...camera.position))).toBeCloseTo(1);
  });
  it('resamples a signed full turn into editable keys that survive save and retiming', () => {
    const samples: MotionSample[] = Array.from({ length: 121 }, (_, i) => ({ time: 100 + i / 60, position: [i / 60, 0, 4], quaternion: toQuaternion([0, 0, i * 3]).toArray() }));
    const asset = cameraTake(samples);
    expect(asset.duration).toBe(2); expect(asset.tracks[0].keys).toHaveLength(61);
    expect(asset.tracks[1].keys.at(-1)!.value[2]).toBeCloseTo(360);
    let project = insertClip({ ...makeProject(), camera: makeCamera() }, asset, CAMERA_ID, 1);
    project = transformClip(project, project.clips![0].id, 1, 4);
    project = parseProject(JSON.stringify(project));
    expect(sample(project, 'model', 'position', 3, CAMERA_ID)[0]).toBeCloseTo(1);
    expect(sample(project, 'model', 'rotation', 3, CAMERA_ID)[2]).toBeCloseTo(180);
    expect(project.objects[0].position).toEqual([0, 0, 0]);
  });
  it('rejects tracking gaps, short takes and malformed pose data', () => {
    const point: MotionSample = { time: 0, position: [0, 0, 0], quaternion: [0, 0, 0, 1] };
    expect(() => cameraTake([point])).toThrow();
    expect(() => cameraTake([point, { ...point, time: 1 }])).toThrow(/gap/);
    expect(() => cameraTake([point, point])).toThrow(/gap/);
    expect(phonePoseSchema.safeParse(pose({ quaternion: [0, 0, 0, 2] })).success).toBe(false);
    expect(phonePoseSchema.safeParse(pose({ position: [NaN, 0, 0] })).success).toBe(false);
  });
  it('replays fractional-frame rotations on the captured quaternion arc when slowed', () => {
    const a = toQuaternion([0, 89, 0]), b = toQuaternion([90, 89, -90]);
    const asset = cameraTake([{ time: 0, position: [0, 0, 0], quaternion: a.toArray() }, { time: 1 / 30, position: [0, 0, 0], quaternion: b.toArray() }]);
    let project = insertClip({ ...makeProject(), camera: makeCamera() }, asset, CAMERA_ID, 0);
    project = transformClip(project, project.clips![0].id, 0, 1);
    const midway = toQuaternion(sample(project, 'model', 'rotation', .5, CAMERA_ID));
    expect(midway.angleTo(a.clone().slerp(b, .5))).toBeLessThan(1e-7);
  });
});
