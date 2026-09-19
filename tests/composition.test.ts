import { describe, expect, it } from 'vitest';
import { HUMANOID_ID, hasCharacter, makeObject, makeProject, parseProject, putKey, sample, seedIdle, validateProject, type Vec3 } from '../src/core/project';
import { applyProposal, demoProposal, sceneSignature, type Proposal } from '../src/core/proposals';

describe('portable multi-object scenes', () => {
  it('migrates v1 motion and complete rotation paths without changing any samples', () => {
    let original = seedIdle(makeProject());
    original = putKey(original, 'model', 'rotation', 0, [0, 0, 0], 'linear');
    const route: Vec3[] = [[0, 0, 0], [0, 90, 0], [0, 180, 0], [0, 270, 0], [0, 360, 0]];
    original = putKey(original, 'model', 'rotation', 5, [0, 360, 0], 'smooth', route);
    const { objects: _objects, id: _id, ...legacy } = original;
    const v1 = { ...legacy, version: 1, hasCharacter: true, tracks: original.tracks.map(({ objectId: _objectId, ...track }) => track) };
    const migrated = parseProject(JSON.stringify(v1));
    expect(migrated.version).toBe(2);
    expect(migrated.tracks).toEqual(original.tracks);
    for (let time = 0; time <= 5; time += .1) for (const track of original.tracks) expect(sample(migrated, track.target, track.channel, time)).toEqual(sample(original, track.target, track.channel, time));
    const removed = parseProject(JSON.stringify({ ...v1, hasCharacter: false }));
    expect(hasCharacter(removed)).toBe(false);
    expect(removed.tracks).toEqual(original.tracks);
  });
  it('keeps every object static until independently keyed and round-trips references', () => {
    let project = makeProject();
    const one = makeObject('box'), two = makeObject('box', 1); one.referenceAssetIds = ['a'.repeat(64)];
    project.objects.push(one, two);
    project = putKey(project, 'model', 'position', 0, [0, 0, 0], 'linear', undefined, one.id);
    project = putKey(project, 'model', 'position', 5, [5, 0, 0], 'smooth', undefined, one.id);
    project = putKey(project, 'model', 'position', 0, [10, 0, 0], 'linear', undefined, two.id);
    project = putKey(project, 'model', 'position', 5, [0, 0, 0], 'smooth', undefined, two.id);
    expect(sample(project, 'model', 'position', 2.5, one.id)).toEqual([2.5, 0, 0]);
    expect(sample(project, 'model', 'position', 2.5, two.id)).toEqual([5, 0, 0]);
    expect(sample(project, 'model', 'position', 2.5, HUMANOID_ID)).toEqual([0, 0, 0]);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(seedIdle(project).tracks.filter(t => t.objectId !== HUMANOID_ID)).toEqual(project.tracks);
  });
  it('rejects duplicate objects, missing track owners, invalid dimensions and bone tracks on props', () => {
    const project = makeProject(), box = makeObject('box'); project.objects.push(box);
    expect(() => validateProject({ ...project, objects: [...project.objects, box] })).toThrow();
    expect(() => validateProject({ ...project, objects: [{ ...box, dimensions: [1, -1, 1] }] })).toThrow();
    expect(() => validateProject(putKey(project, 'head', 'rotation', 1, [1, 0, 0], 'linear', undefined, box.id))).toThrow();
    expect(() => validateProject(putKey(project, 'model', 'position', 1, [1, 0, 0], 'linear', undefined, 'missing'))).toThrow();
  });
  it('rejects demo insertion at capacity without corrupting the saved scene', () => {
    const project = makeProject(); project.objects = Array.from({ length: 32 }, (_, i) => makeObject('box', i));
    const before = structuredClone(project);
    expect(() => seedIdle(project)).toThrow(/scene is full/);
    expect(project).toEqual(before); expect(parseProject(JSON.stringify(project))).toEqual(before);
  });
});

describe('atomic AI proposals', () => {
  it('previews without mutation and applies only the selected object tracks', () => {
    let project = seedIdle(makeProject()); const box = makeObject('box'); project.objects.push(box);
    const before = structuredClone(project), proposal = demoProposal(project, 'movement', 'move', box.id);
    const preview = applyProposal(project, proposal);
    expect(project).toEqual(before);
    expect(preview.tracks.filter(t => t.objectId === HUMANOID_ID)).toEqual(project.tracks);
    expect(sample(preview, 'model', 'position', 2.5, box.id)[0]).toBe(box.position[0] + 1);
  });
  it('invalid and stale proposals leave the source unchanged', () => {
    const project = makeProject(), before = structuredClone(project);
    const proposal = demoProposal(project, 'movement', 'nod', HUMANOID_ID);
    if (proposal.content.kind !== 'movement') throw new Error('Wrong fixture');
    proposal.content.tracks[0].keys[1].time = 100;
    expect(() => applyProposal(project, proposal)).toThrow(); expect(project).toEqual(before);
    const stale = demoProposal(project, 'composition', 'place', HUMANOID_ID); project.objects[0].position[0] = 1;
    expect(() => applyProposal(project, stale)).toThrow(/scene changed/);
  });
  it('rejects repeated replacement tracks and duplicate humanoids', () => {
    const project = makeProject(), movement = demoProposal(project, 'movement', 'nod', HUMANOID_ID);
    if (movement.content.kind !== 'movement') throw new Error('Wrong fixture');
    movement.content.tracks.push(structuredClone(movement.content.tracks[0]));
    expect(() => applyProposal(project, movement)).toThrow(/Duplicate/);
    const object = demoProposal(project, 'object', 'humanoid', HUMANOID_ID);
    if (object.content.kind !== 'object') throw new Error('Wrong fixture');
    object.content.object.kind = 'humanoid'; expect(() => applyProposal(project, object)).toThrow();
  });
  it('composition placements move existing animation and preserve winding', () => {
    let project = makeProject();
    project = putKey(project, 'model', 'position', 0, [1, 0, 0], 'linear');
    project = putKey(project, 'model', 'position', 5, [3, 0, 0]);
    project = putKey(project, 'model', 'rotation', 0, [0, 0, 0], 'linear');
    project = putKey(project, 'model', 'rotation', 5, [0, 360, 0], 'smooth', [[0, 0, 0], [0, 90, 0], [0, 180, 0], [0, 270, 0], [0, 360, 0]]);
    const proposal: Proposal = { id: 'proposal', mode: 'live', prompt: 'place', baseSignature: sceneSignature(project), content: { kind: 'composition', placements: [{ objectId: HUMANOID_ID, position: [4, 0, 0], rotation: [0, 90, 0] }] } };
    const moved = applyProposal(project, proposal);
    expect(sample(moved, 'model', 'position', 5)).toEqual([6, 0, 0]);
    expect(sample(moved, 'model', 'rotation', 2.5)).toEqual([0, 270, 0]);
    expect(parseProject(JSON.stringify(moved))).toEqual(moved);
  });
});
