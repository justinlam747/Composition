import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CAMERA_ID, makeCamera, makeProject, moveKey, parseProject, putKey, sample, validateProject } from '../src/core/project';
import { sceneSignature } from '../src/core/proposals';
import { cameraFrame, cameraPreviewFrame, createShotCamera, MIN_PREVIEW_SCALE, SHOT_ASPECT } from '../src/scene/shotCamera';
import { editTransformKey } from '../src/core/keyEditing';

describe('saved shot camera', () => {
  it('round-trips and samples a camera move independently of object motion', () => {
    let project = { ...makeProject(), camera: makeCamera() };
    project = putKey(project, 'model', 'position', 0, [0, 1, 5], 'linear', undefined, CAMERA_ID) as typeof project;
    project = putKey(project, 'model', 'position', 5, [0, 1, 2], 'linear', undefined, CAMERA_ID) as typeof project;
    const restored = parseProject(JSON.stringify(project));
    expect(sample(restored, 'model', 'position', 2.5, CAMERA_ID)).toEqual([0, 1, 3.5]);
    expect(sample(restored, 'model', 'position', 2.5)).toEqual([0, 0, 0]);
    const rig = createShotCamera(new Scene());
    rig.sync(restored, 2.5);
    expect(rig.camera.position.toArray()).toEqual([0, 1, 3.5]);
    expect(rig.camera.aspect).toBe(SHOT_ASPECT);
    expect(rig.camera.parent).not.toBeNull();
    rig.dispose();
  });
  it('preserves full camera turns and supports retiming', () => {
    let project = { ...makeProject(), camera: makeCamera() };
    project = putKey(project, 'model', 'rotation', 0, [0, 0, 0], 'linear', undefined, CAMERA_ID) as typeof project;
    project = putKey(project, 'model', 'rotation', 2, [0, 360, 0], 'linear', undefined, CAMERA_ID) as typeof project;
    const key = project.tracks[0].keys[1];
    const slower = moveKey(project, key.id, 4);
    expect(sample(slower, 'model', 'rotation', 2, CAMERA_ID)).toEqual([0, 180, 0]);
    expect(validateProject(slower)).toEqual(slower);
  });
  it('invalidates guides for camera changes and retains legacy signatures', () => {
    const legacy = makeProject();
    expect(parseProject(JSON.stringify(legacy)).camera).toBeUndefined();
    expect(sceneSignature({ ...legacy, camera: undefined })).toBe(sceneSignature(legacy));
    const withCamera = { ...legacy, camera: makeCamera() };
    const changed = { ...withCamera, camera: { ...withCamera.camera, position: [0, 2, 4] as [number, number, number] } };
    expect(sceneSignature(changed)).not.toBe(sceneSignature(withCamera));
    expect(sceneSignature(withCamera)).not.toBe(sceneSignature(legacy));
  });
  it('keeps incoming and outgoing camera arcs when tweaking an endpoint', () => {
    const project = putKey(putKey({ ...makeProject(), camera: makeCamera() }, 'model', 'rotation', 0, [0, 0, 0], 'linear', undefined, CAMERA_ID),
      'model', 'rotation', 5, [0, 90, 0], 'linear', [[0, 0, 0], [0, 0, 90], [0, 90, 90], [0, 90, 0]], CAMERA_ID);
    const endpoint = editTransformKey(project, { objectId: CAMERA_ID, target: 'model', channel: 'rotation', time: 5, value: [0, 91, 0] });
    expect(sample(endpoint, 'model', 'rotation', 2.5, CAMERA_ID)[2]).toBeGreaterThan(80);
    const startpoint = editTransformKey(project, { objectId: CAMERA_ID, target: 'model', channel: 'rotation', time: 0, value: [0, 1, 0] });
    expect(sample(startpoint, 'model', 'rotation', 2.5, CAMERA_ID)[2]).toBeGreaterThan(80);
    expect(validateProject(endpoint)).toEqual(endpoint); expect(validateProject(startpoint)).toEqual(startpoint);
  });
  it('rejects malformed camera data, orphan tracks, scale, and colliding object IDs', () => {
    const project = { ...makeProject(), camera: makeCamera() };
    expect(() => validateProject({ ...project, camera: { position: [Infinity, 0, 0], rotation: [0, 0, 0] } })).toThrow();
    const animated = putKey(project, 'model', 'position', 0, [0, 1, 5], 'smooth', undefined, CAMERA_ID);
    expect(() => validateProject({ ...animated, camera: undefined })).toThrow();
    expect(() => validateProject(putKey(project, 'model', 'scale', 0, [1, 1, 1], 'smooth', undefined, CAMERA_ID))).toThrow();
    expect(() => validateProject({ ...project, objects: [{ ...project.objects[0], id: CAMERA_ID, kind: 'box' }] })).toThrow();
  });
  it.each([[1440, 900], [900, 430], [390, 520]])('keeps the frame inside a %s by %s viewport at the export aspect', (width, height) => {
    const frame = cameraFrame(width, height);
    expect(frame.width / frame.height).toBeCloseTo(SHOT_ASPECT);
    expect(frame.x).toBeGreaterThan(0); expect(frame.y).toBeGreaterThan(0);
    expect(frame.x + frame.width).toBeLessThan(width); expect(frame.y + frame.height).toBeLessThan(height);
  });
  it('scales only the centered editor preview and clamps its useful range', () => {
    const full = cameraFrame(1440, 900), half = cameraPreviewFrame(1440, 900, .5);
    expect(half.width).toBeCloseTo(full.width / 2); expect(half.height / half.width).toBeCloseTo(1 / SHOT_ASPECT);
    expect(half.x + half.width / 2).toBe(720); expect(half.y + half.height / 2).toBe(450);
    expect(cameraPreviewFrame(1440, 900, 2)).toEqual(full);
    expect(cameraPreviewFrame(1440, 900, 0).width).toBeCloseTo(full.width * MIN_PREVIEW_SCALE);
  });
  it('pans the editor preview without allowing it outside the viewport', () => {
    const centered = cameraPreviewFrame(1440, 900, .5), moved = cameraPreviewFrame(1440, 900, .5, 120, -80);
    expect(moved).toMatchObject({ x: centered.x + 120, y: centered.y - 80, width: centered.width, height: centered.height });
    const clamped = cameraPreviewFrame(1440, 900, .5, 10000, -10000);
    expect(clamped.x + clamped.width).toBe(1440); expect(clamped.y).toBe(0);
  });
});
