import { z } from 'zod';
import { Vector3 } from 'three';
import { CAMERA_ID, HUMANOID_ID, fromQuaternion, toQuaternion, unwrapRotation, makeCamera, sample, uid, validateProject, type AnimationAsset, type Project, type Vec3 } from './project';
import { applyProposal, objectFromSpec, objectSpecSchema, sceneSignature } from './proposals';
import { insertClip, transformClip, validateAnimation } from './clips';
import { propGeometrySchema } from './propGeometry';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const vector = z.tuple([z.number().finite().min(-10000).max(10000), z.number().finite().min(-10000).max(10000), z.number().finite().min(-10000).max(10000)]);
const dimensions = vector.refine(value => value.every(n => n >= .05 && n <= 20));
const time = z.number().finite().min(0).max(10);
const duration = z.number().finite().min(.5).max(10);
const floorPoint = z.tuple([z.number().finite().min(-20).max(20), z.literal(0), z.number().finite().min(-20).max(20)]);
const floorOffset = z.tuple([z.number().finite().min(-40).max(40), z.literal(0), z.number().finite().min(-40).max(40)]);
const tracks = z.array(z.object({ target: z.string().max(40), channel: z.enum(['position', 'rotation', 'scale']), keys: z.array(z.object({ time, value: vector, ease: z.enum(['linear', 'smooth']) }).strict()).min(2).max(60) }).strict()).min(1).max(40);
export const directorActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_placement'), location: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('absolute'), position: floorPoint }).strict(),
    z.object({ kind: z.literal('relative'), objectId: id, offset: floorOffset, time }).strict(),
  ]) }).strict(),
  z.object({ kind: z.literal('create_object'), objectId: id, spec: objectSpecSchema, position: vector, rotation: vector }).strict(),
  z.object({ kind: z.literal('update_object'), objectId: id, name: z.string().trim().min(1).max(120).optional(), dimensions: vector.optional(), geometry: propGeometrySchema.optional(), position: vector.optional(), rotation: vector.optional(), scale: vector.optional() }).strict(),
  z.object({ kind: z.literal('delete_object'), objectId: id }).strict(),
  z.object({ kind: z.literal('camera_pose'), position: vector, rotation: vector }).strict(),
  z.object({ kind: z.literal('animate'), objectId: id, name: z.string().trim().min(1).max(120), start: time, duration, tracks, replaceClipId: id.optional() }).strict(),
  z.object({ kind: z.literal('generate_motion'), prompt: z.string().trim().min(1).max(4000), start: time, duration, replaceClipId: id.optional() }).strict(),
  z.object({ kind: z.literal('retime_clip'), clipId: id, start: time, duration }).strict(),
]);
export type DirectorAction = z.infer<typeof directorActionSchema>;
export const directorResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), message: z.string().trim().min(1).max(3000) }).strict(),
  z.object({ kind: z.literal('proposal'), message: z.string().trim().min(1).max(3000), actions: z.array(directorActionSchema).min(1).max(24) }).strict(),
]);
export type DirectorResponse = z.infer<typeof directorResponseSchema>;
export type DirectorResponseSource = 'demo-cache' | 'live';
export const directorMessageSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }).strict();
export type DirectorMessage = z.infer<typeof directorMessageSchema>;
export const directorContextSchema = z.object({
  objectId: id.nullable(), clipId: id.nullable(), time,
  placement: vector.nullable(), view: z.object({ position: vector, rotation: vector, fov: z.number().min(1).max(179) }).strict().optional(),
}).strict();
export type DirectorContext = z.infer<typeof directorContextSchema>;
export const directorInputSchema = z.object({ sessionId: id, project: z.unknown(), context: directorContextSchema,
  executionId: id.optional(),
  messages: z.array(directorMessageSchema).max(30), text: z.string().trim().min(1).max(4000),
  image: z.string().max(1_400_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).optional(),
}).strict();
export interface DirectorInput extends Omit<z.infer<typeof directorInputSchema>, 'project'> { project: Project }
export interface DirectorProposal {
  id: string; sessionId: string; projectId: string; revision: number; baseSignature: string;
  summary: string; actions: DirectorAction[]; status: 'pending' | 'approved' | 'cancelled' | 'applied'; source?: DirectorResponseSource;
}
export interface DirectorTurn { message: string; proposal?: DirectorProposal; source?: DirectorResponseSource }
export interface DirectorExecution {
  id: string; proposal: DirectorProposal; status: 'running' | 'ready' | 'failed' | 'cancelled' | 'applied';
  animations: Record<string, AnimationAsset>; error?: string;
}
export type DirectorDecision = 'approve' | 'cancel' | 'applied' | 'refresh';
export function explicitDirectorDecision(text: string): 'approve' | 'cancel' | undefined {
  const clean = text.toLowerCase().trim().replace(/[.!?,]/g, '').replace(/\s+/g, ' ');
  if (/^(yes|yes please|yes do it|yes apply it|yep|yeah|correct|looks good|go ahead|do it|apply|apply it|approve|confirm|that is correct|that's correct)$/.test(clean)) return 'approve';
  if (/^(no|no thanks|cancel|cancel it|never mind|nevermind|stop|stop that|don't do it|do not apply)$/.test(clean)) return 'cancel';
}

export function directorSceneContext(project: Project, context: DirectorContext) {
  return { projectId: project.id, signature: sceneSignature(project), duration: project.duration, ...context,
    objects: project.objects.filter(o => !o.hidden).map(o => ({ ...o, position: sample(project, 'model', 'position', context.time, o.id), rotation: sample(project, 'model', 'rotation', context.time, o.id), scale: sample(project, 'model', 'scale', context.time, o.id) })),
    camera: project.camera ? { position: sample(project, 'model', 'position', context.time, CAMERA_ID), rotation: sample(project, 'model', 'rotation', context.time, CAMERA_ID) } : null,
    clips: project.clips?.map(({ id, name, objectId, start, duration }) => ({ id, name, objectId, start, duration })) ?? [],
    tracks: project.tracks.map(t => ({ objectId: t.objectId, target: t.target, channel: t.channel, keys: t.keys.filter((_, i) => i === 0 || i === t.keys.length - 1) })),
  };
}

/** One pure, atomic command path used for validation, previews and acceptance. */
export function applyDirectorActions(project: Project, actions: DirectorAction[], animations: Record<string, AnimationAsset> = {}, allowPending = false): Project {
  return prepareDirectorActions(project, actions, animations, allowPending).project;
}

export function prepareDirectorActions(project: Project, actions: DirectorAction[], animations: Record<string, AnimationAsset> = {}, allowPending = false): { project: Project; placement?: Vec3 } {
  let next = validateProject(project);
  let placement: Vec3 | undefined;
  for (const [index, raw] of actions.entries()) {
    const action = directorActionSchema.parse(raw);
    if (action.kind === 'set_placement') {
      const location = action.location;
      if (location.kind === 'absolute') placement = location.position;
      else {
        if (!next.objects.some(object => object.id === location.objectId && !object.hidden)) throw new Error('The marker reference object no longer exists or is hidden.');
        if (location.time > next.duration) throw new Error('The marker reference time is outside the scene.');
        const origin = sample(next, 'model', 'position', location.time, location.objectId);
        placement = [origin[0] + location.offset[0], 0, origin[2] + location.offset[2]];
      }
      if (!floorPoint.safeParse(placement).success) throw new Error('Place the marker on the floor within 20 units of the scene origin on X and Z.');
      continue;
    } else if (action.kind === 'create_object') {
      const object = objectFromSpec(action.spec, next);
      if (object.kind === 'box' && action.objectId === HUMANOID_ID || next.objects.some(o => o.id === action.objectId)) throw new Error('An object with this ID already exists.');
      next.objects.push({ ...object, id: action.objectId, position: action.position, rotation: action.rotation });
    } else if (action.kind === 'update_object') {
      const object = next.objects.find(o => o.id === action.objectId && !o.hidden);
      if (!object) throw new Error('The target object no longer exists.');
      if (action.scale && [next.tracks, ...next.clips?.filter(clip => clip.objectId === object.id).map(clip => clip.tracks) ?? []].some(tracks => tracks.some(track => track.objectId === object.id && track.target === 'model' && track.channel === 'scale' && track.keys.length))) throw new Error('This object has animated scale. Resize its dimensions or replace its scale animation.');
      if (action.position || action.rotation) {
        next = applyProposal(next, { id: 'director-placement', mode: 'live', baseSignature: sceneSignature(next), prompt: '', content: { kind: 'composition', placements: [{ objectId: object.id,
          position: action.position ?? sample(next, 'model', 'position', 0, object.id), rotation: action.rotation ?? sample(next, 'model', 'rotation', 0, object.id) }] } });
      }
      const { kind: _kind, objectId: _id, position: _p, rotation: _r, ...patch } = action;
      if (patch.dimensions) dimensions.parse(patch.dimensions);
      next.objects = next.objects.map(o => o.id === object.id ? { ...o, ...patch } : o);
    } else if (action.kind === 'delete_object') {
      if (!next.objects.some(o => o.id === action.objectId) && !(action.objectId === CAMERA_ID && next.camera)) throw new Error('The target no longer exists.');
      next.objects = next.objects.filter(o => o.id !== action.objectId);
      next.tracks = next.tracks.filter(t => t.objectId !== action.objectId);
      next.clips = next.clips?.filter(c => c.objectId !== action.objectId);
      next.velocities = next.velocities?.filter(v => v.objectId !== action.objectId);
      if (action.objectId === CAMERA_ID) delete next.camera;
    } else if (action.kind === 'camera_pose') {
      if (next.tracks.some(t => t.objectId === CAMERA_ID) || next.clips?.some(c => c.objectId === CAMERA_ID)) throw new Error('The camera is animated. Propose a camera animation replacement to change its shot.');
      next.camera = { position: action.position, rotation: action.rotation };
    } else if (action.kind === 'retime_clip') {
      if (!next.clips?.some(c => c.id === action.clipId)) throw new Error('The animation block no longer exists.');
      next = transformClip(next, action.clipId, action.start, action.duration);
    } else {
      const objectId = action.kind === 'generate_motion' ? HUMANOID_ID : action.objectId;
      if (objectId === CAMERA_ID && !next.camera) next.camera = makeCamera();
      const kind = objectId === CAMERA_ID ? 'camera' : next.objects.find(o => o.id === objectId && !o.hidden)?.kind;
      if (!kind) throw new Error('Add a visible target before animating it.');
      if (action.replaceClipId) {
        const clip = next.clips?.find(c => c.id === action.replaceClipId && c.objectId === objectId);
        if (!clip) throw new Error('The animation to replace no longer exists.');
        next.clips = next.clips?.filter(c => c.id !== clip.id);
      } else if (next.tracks.some(t => t.objectId === objectId && t.keys.length) && !next.clips?.some(c => c.objectId === objectId)) {
        throw new Error('This target has unblocked keyframes. Save them as an animation block before adding director motion.');
      }
      let asset: AnimationAsset;
      if (action.kind === 'animate') {
        asset = validateAnimation({ id: uid(), name: action.name, kind, source: 'ai', duration: action.duration, tracks: action.tracks.map(t => ({ ...t, objectId, keys: t.keys.map(k => ({ ...k, id: uid() })) })) });
      } else if (animations[String(index)]) asset = validateAnimation(animations[String(index)]);
      else if (allowPending) asset = { id: `pending-${index}`, name: action.prompt.slice(0, 120), kind: 'humanoid', source: 'ai', duration: action.duration,
        tracks: [{ objectId, target: 'model', channel: 'position', keys: [0, action.duration].map(time => ({ id: uid(), time, value: sample(next, 'model', 'position', action.start, objectId), ease: 'linear' })) }] };
      else throw new Error('The generated motion is not ready yet.');
      next = insertClip(next, asset, objectId, action.start);
    }
    next = validateProject(next);
  }
  return { project: next, placement };
}

export function rebaseMotion(asset: AnimationAsset, project: Project, start: number): AnimationAsset {
  const motion = structuredClone(asset);
  const rotation = motion.tracks.find(t => t.target === 'model' && t.channel === 'rotation');
  const anchorRotation = sample(project, 'model', 'rotation', start, HUMANOID_ID);
  const delta = toQuaternion(anchorRotation).multiply(toQuaternion(rotation?.keys[0]?.value ?? [0, 0, 0]).invert());
  const track = motion.tracks.find(t => t.target === 'model' && t.channel === 'position');
  if (track?.keys.length) {
    const origin = track.keys[0].value, anchor = sample(project, 'model', 'position', start, HUMANOID_ID);
    track.keys = track.keys.map(key => ({ ...key, value: new Vector3(...key.value).sub(new Vector3(...origin)).applyQuaternion(delta).add(new Vector3(...anchor)).toArray() as Vec3 }));
  }
  let previous = anchorRotation;
  if (rotation) rotation.keys = rotation.keys.map(key => {
    const value = unwrapRotation(fromQuaternion(delta.clone().multiply(toQuaternion(key.value))), previous); previous = value;
    return { ...key, value, ...(key.rotationPath ? { rotationPath: key.rotationPath.map(point => unwrapRotation(fromQuaternion(delta.clone().multiply(toQuaternion(point))), value)) } : {}) };
  });
  return motion;
}
