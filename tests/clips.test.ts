import { describe, expect, it } from 'vitest';
import { animationFromClip, clipPreview, insertClip, splitClip, transformClip, validateAnimation } from '../src/core/clips';
import { HUMANOID_ID, clipSourceTime, makeProject, parseProject, putKey, sample, validateProject } from '../src/core/project';
import { loadSpiderDemo, spiderAnimations } from '../src/core/spiderDemo';
import { sceneSignature } from '../src/core/proposals';

describe('animation blocks', () => {
  it('plays the three cached actions without a provider and preserves them through scene files', () => {
    const project = loadSpiderDemo(makeProject());
    expect(project.clips?.map(clip => [clip.name, clip.start, clip.duration])).toEqual([['Drop to floor', 0, 2], ['Shoot web', 2, 1.5], ['Swing and land', 3.5, 5.5]]);
    expect(sample(project, 'model', 'position', 0)[1]).toBeGreaterThan(3);
    expect(sample(project, 'model', 'position', 2)[1]).toBe(0);
    expect(sample(project, 'model', 'position', 5)[1]).toBeGreaterThan(1);
    expect(sample(project, 'model', 'position', 9)).toEqual([3, 0, 0]);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
  });
  it('stretching changes the speed without modifying source keys', () => {
    const project = insertClip(makeProject(), spiderAnimations[0], HUMANOID_ID, 1);
    const clip = project.clips![0];
    const stretched = transformClip(project, clip.id, 1, 4);
    expect(stretched.clips![0].tracks).toEqual(clip.tracks);
    expect(sample(stretched, 'model', 'position', 3)).toEqual(sample(project, 'model', 'position', 2));
    expect(sample(stretched, 'model', 'position', 0)).toEqual([0, 0, 0]);
    expect(sample(stretched, 'model', 'position', 5)).toEqual(sample(stretched, 'model', 'position', 6));
  });
  it('split preserves every sampled value, including smooth interpolation and authored turns', () => {
    let source = putKey(makeProject(), 'model', 'rotation', 0, [0, 0, 0]);
    source = putKey(source, 'model', 'rotation', 5, [0, 720, 0], 'smooth', Array.from({ length: 9 }, (_, i) => [0, i * 90, 0]));
    const asset = validateAnimation({ id: 'turn', name: 'Turn', kind: 'humanoid', source: 'edited', duration: 5, tracks: source.tracks });
    let project = insertClip({ ...makeProject(), duration: 10 }, asset, HUMANOID_ID, 1);
    project = transformClip(project, project.clips![0].id, 1, 7);
    const split = splitClip(project, project.clips![0].id, 3.3);
    for (let frame = 0; frame <= 300; frame++) {
      sample(split, 'model', 'rotation', frame / 30).forEach((value, axis) => expect(value).toBeCloseTo(sample(project, 'model', 'rotation', frame / 30)[axis], 8));
    }
    expect(split.clips![0].sourceEnd).toBe(split.clips![1].sourceStart);
    expect(split.clips![0].tracks[0].keys[0].id).not.toBe(split.clips![1].tracks[0].keys[0].id);
  });
  it('caches a shortened or split window independently, with matching replay', () => {
    const project = insertClip({ ...makeProject(), duration: 10 }, spiderAnimations[2], HUMANOID_ID, 0);
    const cut = splitClip(project, project.clips![0].id, 2.3), original = cut.clips![1];
    const asset = animationFromClip(cut, original);
    const replay = insertClip({ ...makeProject(), duration: 10 }, asset, HUMANOID_ID, 0);
    for (let frame = 0; frame < 90; frame++) {
      const a = sample(replay, 'model', 'position', frame / 30), b = sample(cut, 'model', 'position', original.start + frame / 30);
      a.forEach((value, axis) => expect(value).toBeCloseTo(b[axis], 8));
    }
    replay.clips![0].tracks[0].keys[0].value[0] = 123;
    expect(original.tracks[0].keys[0].value[0]).not.toBe(123);
    expect(asset.web).toEqual(original.web);
  });
  it('rejects overlaps, invalid sources and incompatible objects, and prevents truncated blocks', () => {
    const project = loadSpiderDemo(makeProject());
    expect(() => transformClip(project, project.clips![0].id, 1, 2)).toThrow();
    expect(() => validateProject({ ...project, duration: 5 })).toThrow();
    expect(() => splitClip(project, project.clips![0].id, 0)).toThrow();
    expect(() => validateProject({ ...project, clips: [{ ...project.clips![0], sourceEnd: Infinity }] })).toThrow();
    expect(() => insertClip(project, spiderAnimations[0], 'missing', 0)).toThrow();
    expect(() => validateAnimation({ ...spiderAnimations[0], tracks: [{ ...spiderAnimations[0].tracks[0], target: 'unknown' }] })).toThrow();
  });
  it('retiming invalidates guide output and source time clamps during a hold', () => {
    const project = insertClip(makeProject(), spiderAnimations[0], HUMANOID_ID, 0);
    const changed = transformClip(project, project.clips![0].id, 1, 2);
    expect(sceneSignature(project)).not.toBe(sceneSignature(changed));
    expect(clipSourceTime(changed.clips![0], 5)).toBe(2);
  });
  it('supports ease-in and ease-out inside independently timed blocks', () => {
    let source = putKey(makeProject(), 'model', 'position', 0, [0, 0, 0], 'ease-in');
    source = putKey(source, 'model', 'position', 2, [4, 0, 0]);
    expect(sample(source, 'model', 'position', 1)[0]).toBe(1);
    source.tracks[0].keys[0].ease = 'ease-out';
    expect(sample(source, 'model', 'position', 1)[0]).toBe(3);
    expect(parseProject(JSON.stringify(source))).toEqual(source);
  });
  it('shows the edited block at its final frame instead of sampling the next block', () => {
    const project = loadSpiderDemo(makeProject()), clip = project.clips![0];
    clip.tracks[0].keys.at(-1)!.value = [9, 0, 0];
    expect(sample(project, 'model', 'position', 2)).toEqual([-2, 0, 0]);
    expect(sample(clipPreview(project, clip.id), 'model', 'position', 2)).toEqual([9, 0, 0]);
    expect(project.clips).toHaveLength(3);
  });
});
