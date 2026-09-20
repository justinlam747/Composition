import { describe, expect, it } from 'vitest';
import { studio } from '../src/core/store';
import { CAMERA_ID, HUMANOID_ID, clipSourceTime, makeCamera, makeProject, motionSceneTime, putKey, sample } from '../src/core/project';
import { animationFromTracks, insertClip, splitClip } from '../src/core/clips';

function source() {
  return putKey(putKey({ ...makeProject(), duration: 4 }, 'model', 'position', 0, [0, 0, 0], 'linear'), 'model', 'position', 4, [4, 0, 0]);
}

describe('velocity editing commands', () => {
  it('pins a split clip boundary when reshaping only its velocity', () => {
    const p = source(), project = insertClip(p, animationFromTracks(p, HUMANOID_ID, 'Move', 'edited'), HUMANOID_ID, 0);
    const split = splitClip(project, project.clips![0].id, 2), right = split.clips![1];
    studio.openProject(split); studio.selectClip(right.id, true); studio.patch({ timelineMode: 'velocity' });
    studio.seek(2); studio.addVelocityKey();
    studio.seek(4); studio.addVelocityKey(); studio.updateVelocityKey(studio.get().selectedVelocityKey!, 4, 3);
    const edited = studio.get().project.clips![1];
    expect(clipSourceTime(edited, 2)).toBe(2);
    expect(clipSourceTime(edited, 4)).toBe(4);
    expect(clipSourceTime(edited, 3)).toBeCloseTo(2.75);
    expect(studio.get().project.clips![0]).toEqual(split.clips![0]);
  });
  it('edits the selected pose key at its exact source time despite scene-frame rounding', () => {
    const p = putKey(source(), 'model', 'position', 91 / 30, [3, 0, 0]);
    p.velocities = [{ objectId: HUMANOID_ID, duration: 4, keys: [{ id: 'start', time: 0, speed: 0 }, { id: 'end', time: 4, speed: 2 }] }];
    const key = p.tracks[0].keys[1];
    studio.openProject(p); studio.seek(motionSceneTime(p, key.time, HUMANOID_ID)); studio.patch({ selectedKey: key.id }); studio.setValue([9, 0, 0]);
    studio.setValue([10, 0, 0]);
    expect(studio.get().project.tracks[0].keys).toHaveLength(3);
    expect(studio.get().project.tracks[0].keys.find(value => value.id === key.id)!.value).toEqual([10, 0, 0]);
  });
  it('restores crossed keys during a drag and groups the gesture into one undo', () => {
    const p = source();
    p.velocities = [{ objectId: HUMANOID_ID, duration: 4, keys: [{ id: 'a', time: 1, speed: 1 }, { id: 'b', time: 2, speed: 2 }] }];
    studio.openProject(p); studio.patch({ timelineMode: 'velocity' }); studio.begin();
    studio.updateVelocityKey('a', 2, 1); studio.updateVelocityKey('a', 2.5, 1); studio.end();
    expect(studio.get().project.velocities![0].keys.map(key => [key.id, key.time])).toEqual([['b', 2], ['a', 2.5]]);
    expect(studio.get().undoCount).toBe(1); studio.undo(); expect(studio.get().project.velocities).toEqual(p.velocities);
    studio.redo(); expect(studio.get().project.velocities![0].keys[1].time).toBe(2.5);
  });
  it('keeps both camera channels on the selected retimed source frame through repeated piloting', () => {
    const p = putKey({ ...source(), camera: makeCamera() }, 'model', 'position', 91 / 30, [3, 0, 0], 'linear', undefined, CAMERA_ID);
    p.velocities = [{ objectId: CAMERA_ID, duration: 4, keys: [{ id: 'a', time: 0, speed: 0 }, { id: 'b', time: 4, speed: 2 }] }];
    const key = p.tracks.find(track => track.objectId === CAMERA_ID)!.keys[0];
    studio.openProject(p); studio.selectObject(CAMERA_ID); studio.seek(motionSceneTime(p, key.time, CAMERA_ID)); studio.patch({ selectedKey: key.id });
    studio.cameraPose({ position: [9, 0, 0], rotation: [0, 1, 0] });
    studio.cameraPose({ position: [10, 0, 0], rotation: [0, 2, 0] });
    for (const track of studio.get().project.tracks.filter(track => track.objectId === CAMERA_ID)) expect(track.keys.map(key => key.time)).toEqual([91 / 30]);
  });
  it('keeps manual playback fixed when changing the scene duration', () => {
    const p = source();
    p.velocities = [{ objectId: HUMANOID_ID, keys: [{ id: 'a', time: 0, speed: 0 }, { id: 'b', time: 4, speed: 2 }] }];
    studio.openProject(p); studio.duration(8);
    expect(sample(studio.get().project, 'model', 'position', 2)).toEqual(sample(p, 'model', 'position', 2));
    studio.seek(6); studio.setValue([6, 0, 0]);
    expect(studio.get().project.tracks[0].keys.map(key => key.time)).toEqual([0, 4, 6]);
    expect(sample(studio.get().project, 'model', 'position', 6)).toEqual([6, 0, 0]);
  });
  it('preserves a cached manual envelope when adding a collinear key', () => {
    const p = source();
    p.velocities = [{ objectId: HUMANOID_ID, duration: 4, keys: [{ id: 'a', time: 0, speed: 0 }, { id: 'b', time: 4, speed: 2 }] }];
    const extended = { ...p, duration: 8 };
    const asset = animationFromTracks(extended, HUMANOID_ID, 'Move', 'edited');
    const project = insertClip(extended, asset, HUMANOID_ID, 0);
    studio.openProject(project); studio.selectClip(project.clips![0].id, true); studio.seek(2); studio.addVelocityKey();
    for (const time of [1, 2, 4, 6]) expect(sample(studio.get().project, 'model', 'position', time)).toEqual(sample(project, 'model', 'position', time));
    const split = splitClip(project, project.clips![0].id, 2);
    studio.openProject(split); studio.selectClip(split.clips![1].id, true); studio.seek(3); studio.addVelocityKey();
    for (const time of [2, 3, 4, 6]) expect(sample(studio.get().project, 'model', 'position', time)).toEqual(sample(split, 'model', 'position', time));
  });
});
