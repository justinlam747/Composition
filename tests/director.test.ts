import { describe, expect, it } from 'vitest';
import { applyDirectorActions, prepareDirectorActions, directorActionSchema, directorSceneContext, explicitDirectorDecision, rebaseMotion, type DirectorAction, type DirectorExecution } from '../src/core/director';
import { CAMERA_ID, makeObject, makeProject, sample, type AnimationAsset } from '../src/core/project';
import { deskGeometry } from '../src/core/propGeometry';
import { sceneSignature } from '../src/core/proposals';
import { studio } from '../src/core/store';

export const deskAction = (): DirectorAction => ({ kind: 'create_object', objectId: 'desk', spec: { kind: 'box', name: 'Desk', dimensions: [1.4, .75, .7], geometry: deskGeometry(), referenceAssetIds: [] }, position: [2, 0, 1], rotation: [0, 0, 0] });
export const waveAsset = (): AnimationAsset => ({ id: 'wave', name: 'Wave', kind: 'humanoid', source: 'ai', duration: 2, tracks: [{ objectId: 'humanoid', target: 'arm.L', channel: 'rotation', keys: [{ id: 'wave0', time: 0, value: [0, 0, 0], ease: 'linear' }, { id: 'wave1', time: 2, value: [0, 0, 90], ease: 'linear' }] }] });

describe('director commands', () => {
  const marker = (objectId = 'humanoid', time = 0): DirectorAction => ({ kind: 'set_placement', location: { kind: 'relative', objectId, offset: [5, 0, 0], time } });
  it('places a floor marker relative to the animated pose without changing the project', () => {
    const project = applyDirectorActions(makeProject(), [{ kind: 'animate', objectId: 'humanoid', name: 'Travel', start: 0, duration: 2, tracks: [{ target: 'model', channel: 'position', keys: [{ time: 0, value: [1, 3, 2], ease: 'linear' }, { time: 2, value: [5, 3, 4], ease: 'linear' }] }] }]);
    expect(prepareDirectorActions(project, [marker('humanoid', 1)])).toEqual({ project, placement: [8, 0, 3] });
    expect(prepareDirectorActions(makeProject(), [{ kind: 'update_object', objectId: 'humanoid', position: [2, 1, -3] }, marker()]).placement).toEqual([7, 0, -3]);
  });
  it('rejects marker references and coordinates that cannot be placed', () => {
    expect(() => prepareDirectorActions(makeProject(), [marker('missing')])).toThrow('reference object');
    const hidden = makeProject(); hidden.objects[0].hidden = true;
    expect(() => prepareDirectorActions(hidden, [marker()])).toThrow('hidden');
    const distant = makeProject(); distant.objects[0].position = [18, 0, 0];
    expect(() => applyDirectorActions(distant, [marker()])).toThrow('within 20');
    expect(() => applyDirectorActions(makeProject(), [marker('humanoid', 9)])).toThrow('outside the scene');
    expect(directorActionSchema.safeParse({ kind: 'set_placement', location: { kind: 'absolute', position: [1, 2, 3] } }).success).toBe(false);
  });
  it('applies an approved marker without a scene undo entry and rejects failed batches atomically', () => {
    const project = makeProject(); studio.openProject(project);
    const execution: DirectorExecution = { id: 'marker', status: 'ready', animations: {}, proposal: { id: 'marker', sessionId: 'test', projectId: project.id, status: 'approved', baseSignature: sceneSignature(project), revision: 1, summary: 'Place marker', actions: [marker()] } };
    studio.applyDirector(execution);
    expect(studio.get().directorPlacement).toEqual([5, 0, 0]); expect(studio.get().undoCount).toBe(0); expect(studio.get().project).toEqual(project);
    execution.proposal.actions = [{ kind: 'set_placement', location: { kind: 'absolute', position: [2, 0, 3] } }, { kind: 'delete_object', objectId: 'missing' }];
    expect(() => studio.applyDirector(execution)).toThrow(); expect(studio.get().directorPlacement).toEqual([5, 0, 0]);
    studio.openProject(makeProject()); expect(studio.get().directorPlacement).toBeNull();
  });
  it('creates, resizes and places a desk without touching the input', () => {
    const base = makeProject();
    const next = applyDirectorActions(base, [deskAction(), { kind: 'update_object', objectId: 'desk', dimensions: [2, 1, .8], position: [3, 0, 0] }]);
    expect(base.objects).toHaveLength(1); expect(next.objects[1].dimensions).toEqual([2, 1, .8]); expect(next.objects[1].position).toEqual([3, 0, 0]);
  });
  it('rejects a whole batch on unknown targets, duplicate IDs or invalid geometry', () => {
    const base = makeProject();
    expect(() => applyDirectorActions(base, [deskAction(), { kind: 'delete_object', objectId: 'missing' }])).toThrow();
    expect(() => applyDirectorActions(base, [deskAction(), deskAction()])).toThrow(); expect(base.objects).toHaveLength(1);
    expect(() => applyDirectorActions(base, [{ kind: 'update_object', objectId: 'humanoid', dimensions: [0, 1, 1] }])).toThrow();
  });
  it('rejects a static scale edit that an existing animation would hide', () => {
    const project = applyDirectorActions(makeProject(), [deskAction(), { kind: 'animate', objectId: 'desk', name: 'Grow', start: 0, duration: 2, tracks: [{ target: 'model', channel: 'scale', keys: [{ time: 0, value: [1, 1, 1], ease: 'linear' }, { time: 2, value: [2, 2, 2], ease: 'linear' }] }] }]);
    expect(() => applyDirectorActions(project, [{ kind: 'update_object', objectId: 'desk', scale: [3, 3, 3] }])).toThrow('animated scale');
    expect(applyDirectorActions(project, [{ kind: 'update_object', objectId: 'desk', dimensions: [3, 1, 2] }]).objects[1].dimensions).toEqual([3, 1, 2]);
  });
  it('adds editable camera animation and preserves unrelated motion', () => {
    const project = applyDirectorActions(makeProject(), [{ kind: 'camera_pose', position: [0, 1, 5], rotation: [0, 0, 0] }, { kind: 'animate', objectId: CAMERA_ID, name: 'Push in', start: 0, duration: 2, tracks: [{ target: 'model', channel: 'position', keys: [{ time: 0, value: [0, 1, 5], ease: 'linear' }, { time: 2, value: [0, 1, 3], ease: 'linear' }] }] }]);
    expect(sample(project, 'model', 'position', 1, CAMERA_ID)).toEqual([0, 1, 4]);
    expect(() => applyDirectorActions(project, [{ kind: 'camera_pose', position: [2, 1, 5], rotation: [0, 0, 0] }])).toThrow('animated');
  });
  it('validates motion placement before generation and requires a ready asset', () => {
    const action: DirectorAction = { kind: 'generate_motion', prompt: 'Wave', start: 0, duration: 2 };
    expect(() => applyDirectorActions(makeProject(), [action])).toThrow('not ready');
    const next = applyDirectorActions(makeProject(), [action], { 0: waveAsset() });
    expect(next.clips).toHaveLength(1);
    expect(() => applyDirectorActions(next, [action], {}, true)).toThrow('overlapping');
    expect(() => applyDirectorActions(makeProject(), [{ ...action, start: 9 }], {}, true)).toThrow('10 seconds');
    const replaced = applyDirectorActions(next, [{ ...action, replaceClipId: next.clips![0].id }], { 0: waveAsset() });
    expect(replaced.clips).toHaveLength(1);
  });
  it('retimes and removes animation with its target', () => {
    const project = applyDirectorActions(makeProject(), [{ kind: 'generate_motion', prompt: 'Wave', start: 0, duration: 2 }], { 0: waveAsset() });
    const moved = applyDirectorActions(project, [{ kind: 'retime_clip', clipId: project.clips![0].id, start: 1, duration: 3 }]);
    expect(moved.clips![0].start).toBe(1); expect(moved.clips![0].duration).toBe(3);
    const removed = applyDirectorActions(moved, [{ kind: 'delete_object', objectId: 'humanoid' }]);
    expect(removed.objects).toHaveLength(0); expect(removed.clips).toHaveLength(0);
  });
  it('grounds scene context at the playhead and anchors generated paths', () => {
    const project = makeProject(); project.objects[0].position = [3, 0, 2]; project.objects.push(makeObject('box'));
    const context = directorSceneContext(project, { objectId: null, clipId: null, time: 1, placement: [1, 0, 1] });
    expect(context.objects[0].position).toEqual([3, 0, 2]); expect(context.placement).toEqual([1, 0, 1]);
    const asset = waveAsset(); asset.tracks[0].target = 'model'; asset.tracks[0].channel = 'position'; asset.tracks[0].keys[0].value = [1, 1, 1]; asset.tracks[0].keys[1].value = [2, 1, 1];
    expect(rebaseMotion(asset, project, 0).tracks[0].keys[1].value).toEqual([4, 0, 2]);
  });
  it('accepts explicit decisions and rejects conditional or ambiguous approval', () => {
    expect(explicitDirectorDecision('Yes, please!')).toBe('approve'); expect(explicitDirectorDecision('Cancel it')).toBe('cancel');
    for (const text of ['yes but make it blue', 'maybe', 'do it tomorrow', 'no, wait, yes', 'yes? actually no']) expect(explicitDirectorDecision(text)).toBeUndefined();
  });
  it('preserves the character heading and turns the generated travel path into that heading', () => {
    const project = makeProject(); project.objects[0].rotation = [0, 90, 0]; project.objects[0].position = [3, 0, 2];
    const asset = waveAsset(); asset.tracks = [
      { objectId: 'humanoid', target: 'model', channel: 'rotation', keys: [0, 2].map((time, i) => ({ id: `r${i}`, time, value: [0, 0, 0], ease: 'linear' })) },
      { objectId: 'humanoid', target: 'model', channel: 'position', keys: [{ id: 'p0', time: 0, value: [0, 0, 0], ease: 'linear' }, { id: 'p1', time: 2, value: [0, 0, 1], ease: 'linear' }] },
    ];
    const rebased = rebaseMotion(asset, project, 0);
    expect(rebased.tracks[0].keys[0].value[1]).toBeCloseTo(90);
    expect(rebased.tracks[1].keys[1].value[0]).toBeCloseTo(4);
    expect(rebased.tracks[1].keys[1].value[2]).toBeCloseTo(2);
  });
});
