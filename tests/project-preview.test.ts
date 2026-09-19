import { describe, expect, it } from 'vitest';
import { BONES, CAMERA_ID, HUMANOID_ID, makeCamera, makeObject, makeProject, putKey } from '../src/core/project';
import { projectPreview } from '../src/core/projectPreview';

describe('saved project preview snapshots', () => {
  it('samples visible objects, joints and the saved camera at the first frame without returning motion data', () => {
    let project = makeProject();
    project.camera = makeCamera();
    project.objects.push({ ...makeObject('box'), hidden: true });
    project = putKey(project, 'model', 'position', 0, [3, 0, 2], 'linear', undefined, HUMANOID_ID);
    project = putKey(project, 'arm.L', 'rotation', 0, [15, 30, 45]);
    project = putKey(project, 'model', 'position', 0, [0, 2, 8], 'linear', undefined, CAMERA_ID);
    const preview = projectPreview(project);
    expect(preview.objects).toHaveLength(1);
    expect(preview.objects[0].position).toEqual([3, 0, 2]);
    expect(preview.pose['arm.L']).toEqual([15, 30, 45]);
    expect(Object.keys(preview.pose)).toHaveLength(BONES.length);
    expect(preview.camera?.position).toEqual([0, 2, 8]);
    expect(preview).not.toHaveProperty('tracks');
    expect(preview.objects[0]).not.toHaveProperty('referenceAssetIds');
  });

  it('returns no humanoid pose or camera for a props-only scene', () => {
    const project = { ...makeProject(), objects: [makeObject('box')] };
    const preview = projectPreview(project);
    expect(preview.pose).toEqual({});
    expect(preview.camera).toBeUndefined();
    expect(preview.objects[0].dimensions).toEqual([1, 1, 1]);
  });

  it('retains a visible web effect from a trimmed animation block', () => {
    const project = makeProject();
    project.clips = [{ id: 'web-clip', name: 'Shoot web', objectId: HUMANOID_ID, source: 'edited', start: 0, duration: 2,
      sourceDuration: 3, sourceStart: 1.1, sourceEnd: 3, tracks: [], web: { anchor: [3, 4, 0], start: 1, end: 3 } }];
    const preview = projectPreview(project);
    expect(preview.web?.anchor).toEqual([3, 4, 0]);
    expect(preview.web?.progress).toBeCloseTo(2 / 3);
    project.clips[0].sourceStart = 0;
    expect(projectPreview(project).web).toBeUndefined();
  });
});
