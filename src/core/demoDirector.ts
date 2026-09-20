import type { DirectorAction, DirectorInput, DirectorResponse } from './director';
import { HUMANOID_DIMENSIONS, HUMANOID_ID, type Project, type SceneObject, type Vec3 } from './project';
import { deskGeometry, type PropGeometry } from './propGeometry';

export const DEMO_TABLE_ID = 'demo-classroom-table';
export const DEMO_SCREEN_ID = 'demo-projector-screen';
export const DEMO_CHAIR_IDS = ['demo-chair-1', 'demo-chair-2', 'demo-chair-3', 'demo-chair-4'] as const;
export const DEMO_AUDIENCE_IDS = ['demo-audience-1', 'demo-audience-2', 'demo-audience-3', 'demo-audience-4'] as const;
export const DEMO_IDS = new Set<string>([HUMANOID_ID, DEMO_TABLE_ID, DEMO_SCREEN_ID, ...DEMO_CHAIR_IDS, ...DEMO_AUDIENCE_IDS]);

export const DEMO_CLASSROOM_RESPONSE = 'I’ll stage a classroom with a long table, a projector screen, four evenly spaced chairs with seated humanoids, and one presenter standing in front. Review the preview, then apply it.';
export const DEMO_MOVE_RESPONSE = 'I’ll move the long table exactly 2 meters away from the chairs, toward the front of the classroom. Review the preview, then apply it.';
export const DEMO_REMOVE_RESPONSE = 'I’ll remove the four seated humanoids and keep the presenter, chairs, table, and projector screen. Review the preview, then apply it.';

const TABLE_POSITION: Vec3 = [0, 0, 0];
const MOVED_TABLE_POSITION: Vec3 = [0, 0, -2];
const AUDIENCE_X = [-2.1, -.7, .7, 2.1] as const;

const chairGeometry: PropGeometry = { parts: [
  { shape: 'box', position: [0, .48, 0], size: [1, .12, 1], rotation: [0, 0, 0], color: '#71665a' },
  { shape: 'box', position: [0, .8, .43], size: [1, .65, .12], rotation: [0, 0, 0], color: '#71665a' },
  ...[-.4, .4].flatMap(x => [-.38, .38].map(z => ({ shape: 'box' as const, position: [x, .23, z] as Vec3, size: [.1, .46, .1] as Vec3, rotation: [0, 0, 0] as Vec3, color: '#3f3d39' }))),
] };

const screenGeometry: PropGeometry = { parts: [
  { shape: 'box', position: [0, .58, 0], size: [1, .86, .12], rotation: [0, 0, 0], color: '#f7f7f2' },
  { shape: 'box', position: [0, 1.03, 0], size: [1.06, .05, .18], rotation: [0, 0, 0], color: '#34363a' },
  { shape: 'box', position: [0, .12, 0], size: [.03, .24, .12], rotation: [0, 0, 0], color: '#34363a' },
  { shape: 'box', position: [0, .01, 0], size: [.32, .03, .4], rotation: [0, 0, 0], color: '#34363a' },
] };

function objectSpec(name: string, kind: SceneObject['kind'], dimensions: Vec3, geometry?: PropGeometry) {
  return { name, kind, dimensions, referenceAssetIds: [], ...(geometry ? { geometry } : {}) };
}

function createOrUpdate(project: Project, objectId: string, spec: ReturnType<typeof objectSpec>, position: Vec3, rotation: Vec3): DirectorAction {
  const existing = project.objects.find(object => object.id === objectId);
  if (!existing) return { kind: 'create_object', objectId, spec, position, rotation };
  return { kind: 'update_object', objectId, name: spec.name, dimensions: spec.dimensions, geometry: spec.geometry, position, rotation, scale: [1, 1, 1] };
}

function seatedPose(project: Project, objectId: string): DirectorAction {
  const value = (target: string, rotation: Vec3) => ({ target, channel: 'rotation' as const, keys: [0, project.duration].map(time => ({ time, value: rotation, ease: 'linear' as const })) });
  const existing = project.clips?.filter(clip => clip.objectId === objectId) ?? [];
  return { kind: 'animate', objectId, name: 'Seated classroom pose', start: 0, duration: project.duration, ...(existing[0] ? { replaceClipId: existing[0].id } : {}), tracks: [
    value('thigh.L', [88, 0, -3]), value('thigh.R', [88, 0, 3]),
    value('shin.L', [-88, 0, 0]), value('shin.R', [-88, 0, 0]),
    value('arm.L', [18, 0, 22]), value('arm.R', [18, 0, -22]),
    value('forearm.L', [-58, 0, 0]), value('forearm.R', [-58, 0, 0]),
  ] };
}

function classroomActions(project: Project): DirectorAction[] | undefined {
  if (project.objects.some(object => !DEMO_IDS.has(object.id))) return;
  const presenter = project.objects.find(object => object.id === HUMANOID_ID);
  if (!presenter || presenter.kind !== 'humanoid' || presenter.hidden || presenter.appearance || project.tracks.some(track => track.objectId === HUMANOID_ID) || project.clips?.some(clip => clip.objectId === HUMANOID_ID)) return;
  if (project.objects.some(object => DEMO_IDS.has(object.id) && object.hidden)) return;
  for (const id of [...DEMO_CHAIR_IDS, DEMO_TABLE_ID, DEMO_SCREEN_ID]) {
    const object = project.objects.find(value => value.id === id);
    if (object && object.kind !== 'box') return;
    if (object && (project.tracks.some(track => track.objectId === id) || project.clips?.some(clip => clip.objectId === id))) return;
  }
  for (const id of DEMO_AUDIENCE_IDS) {
    const object = project.objects.find(value => value.id === id);
    if (object && object.kind !== 'humanoid') return;
    if (object?.appearance) return;
    if ((project.clips?.filter(clip => clip.objectId === id).length ?? 0) > 1 || project.tracks.some(track => track.objectId === id)) return;
  }
  const actions: DirectorAction[] = [
    { kind: 'update_object', objectId: HUMANOID_ID, name: 'Classroom presenter', dimensions: HUMANOID_DIMENSIONS, position: [0, 0, -2.8], rotation: [0, 0, 0], scale: [1, 1, 1] },
    createOrUpdate(project, DEMO_TABLE_ID, objectSpec('Long classroom table', 'box', [5.4, .78, .9], deskGeometry()), TABLE_POSITION, [0, 0, 0]),
    createOrUpdate(project, DEMO_SCREEN_ID, objectSpec('Projector screen', 'box', [5, 2.7, .18], screenGeometry), [0, 0, -4], [0, 0, 0]),
  ];
  DEMO_CHAIR_IDS.forEach((id, index) => actions.push(createOrUpdate(project, id, objectSpec(`Chair ${index + 1}`, 'box', [.65, 1, .65], chairGeometry), [AUDIENCE_X[index], 0, 1.2], [0, 180, 0])));
  DEMO_AUDIENCE_IDS.forEach((id, index) => {
    actions.push(createOrUpdate(project, id, objectSpec(`Seated humanoid ${index + 1}`, 'humanoid', HUMANOID_DIMENSIONS), [AUDIENCE_X[index], -.5, 1.18], [0, 180, 0]));
    actions.push(seatedPose(project, id));
  });
  return actions;
}

function normalized(text: string) {
  return text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function classroomIntent(text: string) {
  return /\b(create|build|stage|set up|setup|make|add|want)\b/.test(text) && !/\b(move|shift|remove|delete|clear)\b/.test(text) && /(classroom|projector|screen)/.test(text) && /(desk|table)/.test(text) && /(chair|humanoid|people|students|audience)/.test(text);
}
function moveIntent(text: string) {
  return /\b(move|shift|place)\b/.test(text) && !/\b(remove|delete|clear|create|build|stage|set up|setup|make|add)\b/.test(text) && /\b(desk|table)\b/.test(text) && (/\b2(?:\s*(?:m|meters?|metres?))?\b/.test(text) || /\btwo\b/.test(text)) && /\b(chair|chairs)\b/.test(text) && /\b(farther|further|fartehr|away)\b/.test(text);
}
function removeIntent(text: string) {
  return /\b(remove|delete|clear)\b/.test(text) && /\b(humanoid|humanoids|people|students|audience|characters)\b/.test(text) && !/\b(main|presenter|standing|teacher|chair|chairs|furniture|desk|table|screen|projector)\b/.test(text);
}

function sameVec(actual: Vec3, expected: Vec3) {
  return actual.every((value, index) => Math.abs(value - expected[index]) < .001);
}

function canonicalObject(project: Project, id: string, kind: SceneObject['kind'], dimensions: Vec3, position: Vec3, rotation: Vec3) {
  const object = project.objects.find(value => value.id === id);
  return !!object && object.kind === kind && !object.hidden && sameVec(object.dimensions, dimensions) && sameVec(object.position, position) && sameVec(object.rotation, rotation) && sameVec(object.scale, [1, 1, 1]);
}

function canonicalGeometry(project: Project, id: string, geometry: PropGeometry) {
  return JSON.stringify(project.objects.find(object => object.id === id)?.geometry) === JSON.stringify(geometry);
}

function unanimated(project: Project, objectId: string) {
  return !project.tracks.some(track => track.objectId === objectId) && !project.clips?.some(clip => clip.objectId === objectId);
}

function seatedAnimationReady(project: Project, objectId: string) {
  if (project.tracks.some(track => track.objectId === objectId)) return false;
  const clips = project.clips?.filter(clip => clip.objectId === objectId) ?? [];
  if (clips.length !== 1 || clips[0]!.name !== 'Seated classroom pose' || clips[0]!.start !== 0 || clips[0]!.duration !== project.duration) return false;
  const expected = seatedPose(project, objectId);
  return expected.kind === 'animate' && expected.tracks.every(track => {
    const actual = clips[0]!.tracks.find(value => value.target === track.target && value.channel === track.channel);
    return !!actual && actual.keys.length === track.keys.length && actual.keys.every((key, index) => key.time === track.keys[index]!.time && key.ease === track.keys[index]!.ease && sameVec(key.value, track.keys[index]!.value));
  }) && clips[0]!.tracks.length === expected.tracks.length;
}

function canonicalClassroom(project: Project, audience: 'all' | 'none') {
  const expectedIds = new Set<string>([HUMANOID_ID, DEMO_TABLE_ID, DEMO_SCREEN_ID, ...DEMO_CHAIR_IDS, ...(audience === 'all' ? DEMO_AUDIENCE_IDS : [])]);
  if (project.objects.length !== expectedIds.size || project.objects.some(object => !expectedIds.has(object.id))) return false;
  if (!canonicalObject(project, HUMANOID_ID, 'humanoid', HUMANOID_DIMENSIONS, [0, 0, -2.8], [0, 0, 0]) || project.objects.find(object => object.id === HUMANOID_ID)?.appearance || !unanimated(project, HUMANOID_ID)) return false;
  const table = project.objects.find(object => object.id === DEMO_TABLE_ID);
  if (!table || ![TABLE_POSITION, MOVED_TABLE_POSITION].some(position => canonicalObject(project, DEMO_TABLE_ID, 'box', [5.4, .78, .9], position, [0, 0, 0])) || !canonicalGeometry(project, DEMO_TABLE_ID, deskGeometry()) || !unanimated(project, DEMO_TABLE_ID)) return false;
  if (!canonicalObject(project, DEMO_SCREEN_ID, 'box', [5, 2.7, .18], [0, 0, -4], [0, 0, 0]) || !canonicalGeometry(project, DEMO_SCREEN_ID, screenGeometry) || !unanimated(project, DEMO_SCREEN_ID)) return false;
  if (!DEMO_CHAIR_IDS.every((id, index) => canonicalObject(project, id, 'box', [.65, 1, .65], [AUDIENCE_X[index], 0, 1.2], [0, 180, 0]) && canonicalGeometry(project, id, chairGeometry) && unanimated(project, id))) return false;
  return audience === 'none' || DEMO_AUDIENCE_IDS.every((id, index) => canonicalObject(project, id, 'humanoid', HUMANOID_DIMENSIONS, [AUDIENCE_X[index], -.5, 1.18], [0, 180, 0]) && !project.objects.find(object => object.id === id)?.appearance && seatedAnimationReady(project, id));
}

export function demoDirectorResponse(input: DirectorInput): DirectorResponse | undefined {
  if (!input.project.demo) return;
  const text = normalized(input.text);
  if (classroomIntent(text)) {
    const actions = classroomActions(input.project);
    return actions ? { kind: 'proposal', message: DEMO_CLASSROOM_RESPONSE, actions } : { kind: 'message', message: 'Open a fresh default scene before running the classroom demo. The current scene was not changed.' };
  }
  if (moveIntent(text)) {
    const table = input.project.objects.find(object => object.id === DEMO_TABLE_ID && object.kind === 'box');
    const ready = canonicalClassroom(input.project, 'all') || canonicalClassroom(input.project, 'none');
    if (!table || !ready) return { kind: 'message', message: 'Create the classroom first, then ask me to move the desk. The current scene was not changed.' };
    if (sameVec(table.position, MOVED_TABLE_POSITION)) return { kind: 'message', message: 'The long table is already 2 meters farther from the chairs.' };
    return { kind: 'proposal', message: DEMO_MOVE_RESPONSE, actions: [{ kind: 'update_object', objectId: table.id, position: MOVED_TABLE_POSITION }] };
  }
  if (removeIntent(text)) {
    if (canonicalClassroom(input.project, 'none')) return { kind: 'message', message: 'The four seated humanoids are already removed. The presenter and furniture are unchanged.' };
    if (!canonicalClassroom(input.project, 'all')) return;
    const present = DEMO_AUDIENCE_IDS.filter(id => input.project.objects.some(object => object.id === id && object.kind === 'humanoid'));
    return { kind: 'proposal', message: DEMO_REMOVE_RESPONSE, actions: present.map(objectId => ({ kind: 'delete_object', objectId })) };
  }
}
