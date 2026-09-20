import { describe, expect, it } from 'vitest';
import { applyDirectorActions, type DirectorInput } from '../src/core/director';
import { DEMO_AUDIENCE_IDS, DEMO_CLASSROOM_RESPONSE, DEMO_MOVE_RESPONSE, DEMO_REMOVE_RESPONSE, DEMO_TABLE_ID, demoDirectorResponse } from '../src/core/demoDirector';
import { HUMANOID_ID, makeObject, makeProject, validateProject, type Project } from '../src/core/project';

function request(project: Project, text: string): DirectorInput {
  return { sessionId: 'demo-session', project, messages: [], text, context: { objectId: null, clipId: null, time: 0, placement: null } };
}
function proposal(project: Project, text: string) {
  const result = demoDirectorResponse(request(project, text));
  expect(result?.kind).toBe('proposal');
  return result?.kind === 'proposal' ? result : undefined as never;
}

describe('cached Director classroom demo', () => {
  it('builds the canonical classroom atomically with independent seated humanoids', () => {
    const base = { ...makeProject(), demo: true };
    expect(demoDirectorResponse(request(base, 'I want a desk, projector screen, four chairs, and humanoids'))?.kind).toBe('proposal');
    expect(demoDirectorResponse(request(base, 'Add a classroom with a desk, screen, chairs, and people'))?.kind).toBe('proposal');
    const result = proposal(base, 'Create a classroom with a long desk, projector screen, four chairs and humanoids');
    expect(result.message).toBe(DEMO_CLASSROOM_RESPONSE);
    expect(result.actions).toHaveLength(15);
    const project = applyDirectorActions(base, result.actions);
    expect(project.objects).toHaveLength(11);
    expect(project.objects.find(object => object.id === HUMANOID_ID)).toMatchObject({ name: 'Classroom presenter', position: [0, 0, -2.8] });
    expect(project.objects.filter(object => object.kind === 'humanoid')).toHaveLength(5);
    expect(project.clips?.filter(clip => DEMO_AUDIENCE_IDS.includes(clip.objectId as typeof DEMO_AUDIENCE_IDS[number]))).toHaveLength(4);
    expect(project.camera).toBeUndefined();
    expect(() => validateProject(project)).not.toThrow();
  });

  it('moves the table to one fixed target and removes only the seated audience', () => {
    const base = { ...makeProject(), demo: true };
    const built = applyDirectorActions(base, proposal(base, 'Build a classroom with a table, screen, chairs and students').actions);
    expect(demoDirectorResponse(request(built, 'Remove the main humanoid'))).toBeUndefined();
    expect(demoDirectorResponse(request(built, 'Remove the humanoids from the classroom with the desk and chairs'))).toBeUndefined();
    expect(demoDirectorResponse(request(built, 'Put two chairs farther away'))).toBeUndefined();
    expect(demoDirectorResponse(request(built, 'Build a classroom, then move the desk farther away'))).toBeUndefined();
    expect(demoDirectorResponse(request(built, 'Move the desk 2m farther from the chairs and remove the humanoids'))).toBeUndefined();
    const move = proposal(built, 'Move the desk two meters farther away from the chairs');
    expect(move.message).toBe(DEMO_MOVE_RESPONSE);
    const moved = applyDirectorActions(built, move.actions);
    expect(moved.objects.find(object => object.id === DEMO_TABLE_ID)?.position).toEqual([0, 0, -2]);
    expect(demoDirectorResponse(request(built, 'move the desk 2m fartehr from the chairs'))?.kind).toBe('proposal');
    expect(demoDirectorResponse(request(moved, 'move the table 2m further from the chairs'))).toEqual({ kind: 'message', message: 'The long table is already 2 meters farther from the chairs.' });
    const remove = proposal(moved, 'Remove the humanoids');
    expect(remove.message).toBe(DEMO_REMOVE_RESPONSE);
    const removed = applyDirectorActions(moved, remove.actions);
    expect(removed.objects.filter(object => object.kind === 'humanoid').map(object => object.id)).toEqual([HUMANOID_ID]);
    expect(removed.objects).toHaveLength(7);
    expect(removed.clips).toEqual([]);
  });

  it('falls through unmatched prompts and safely refuses ambiguous scenes', () => {
    const base = { ...makeProject(), demo: true };
    expect(demoDirectorResponse(request(base, 'Make the presenter wave'))).toBeUndefined();
    expect(demoDirectorResponse(request(base, 'Remove the humanoid'))).toBeUndefined();
    const hidden = structuredClone(base); hidden.objects[0]!.hidden = true;
    expect(demoDirectorResponse(request(hidden, 'Build a classroom with a table, projector, chairs and people'))?.kind).toBe('message');
    const animated = structuredClone(base); animated.tracks.push({ objectId: HUMANOID_ID, target: 'head', channel: 'rotation', keys: [{ id: 'demo-test-key', time: 0, value: [0, 0, 0], ease: 'linear' }] });
    expect(demoDirectorResponse(request(animated, 'Build a classroom with a table, projector, chairs and people'))?.kind).toBe('message');
    base.objects.push(makeObject('box'));
    expect(demoDirectorResponse(request(base, 'Build a classroom with a table, projector, chairs and people'))).toEqual({ kind: 'message', message: 'Open a fresh default scene before running the classroom demo. The current scene was not changed.' });
    expect(demoDirectorResponse(request(base, 'Remove the humanoids'))).toBeUndefined();
  });

  it('uses cached follow-up commands only while the classroom remains canonical', () => {
    const base = { ...makeProject(), demo: true };
    const built = applyDirectorActions(base, proposal(base, 'Build a classroom with a table, screen, chairs and students').actions);
    const animatedFurniture = structuredClone(built);
    animatedFurniture.tracks.push({ objectId: DEMO_TABLE_ID, target: 'model', channel: 'position', keys: [{ id: 'moving-table', time: 0, value: [0, 0, 0], ease: 'linear' }] });
    expect(demoDirectorResponse(request(animatedFurniture, 'Move the desk 2m farther from the chairs'))?.kind).toBe('message');
    expect(demoDirectorResponse(request(animatedFurniture, 'Remove the humanoids'))).toBeUndefined();
    const hiddenChair = structuredClone(built); hiddenChair.objects.find(object => object.id === 'demo-chair-1')!.hidden = true;
    expect(demoDirectorResponse(request(hiddenChair, 'Move the desk 2m farther from the chairs'))?.kind).toBe('message');
    expect(demoDirectorResponse(request(hiddenChair, 'Remove the humanoids'))).toBeUndefined();
    const edited = structuredClone(built); edited.objects.find(object => object.id === DEMO_TABLE_ID)!.dimensions[0] = 4;
    expect(demoDirectorResponse(request(edited, 'Remove the humanoids'))).toBeUndefined();
    const changedGeometry = structuredClone(built); changedGeometry.objects.find(object => object.id === DEMO_TABLE_ID)!.geometry = { parts: [] };
    expect(demoDirectorResponse(request(changedGeometry, 'Remove the humanoids'))).toBeUndefined();
    const changedAppearance = structuredClone(built); changedAppearance.objects.find(object => object.id === DEMO_AUDIENCE_IDS[0])!.appearance = 'spider';
    expect(demoDirectorResponse(request(changedAppearance, 'Remove the humanoids'))).toBeUndefined();
    const extra = structuredClone(built); extra.objects.push(makeObject('box', 2));
    expect(demoDirectorResponse(request(extra, 'Remove the humanoids'))).toBeUndefined();
  });
});
