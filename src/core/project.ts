import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

export type Vec3 = [number, number, number];
export type Channel = 'position' | 'rotation' | 'scale';
export type Ease = 'linear' | 'smooth' | 'ease-in' | 'ease-out';
export interface Keyframe { id: string; time: number; value: Vec3; ease: Ease; easePower?: number; rotationPath?: Vec3[] }
export const MAX_ROTATION_PATH_POINTS = 4096;
export interface Track { objectId: string; target: string; channel: Channel; keys: Keyframe[] }
export interface AnimationAsset {
  id: string; name: string; kind: SceneObject['kind'] | 'camera'; source: 'prepared' | 'ai' | 'edited';
  duration: number; tracks: Track[]; web?: { anchor: Vec3; start: number; end: number };
  range?: { start: number; end: number; duration: number };
}
export interface AnimationClip {
  id: string; name: string; objectId: string; source: AnimationAsset['source'];
  start: number; duration: number; sourceDuration: number; sourceStart: number; sourceEnd: number;
  tracks: Track[]; web?: AnimationAsset['web'];
}
export interface SceneObject {
  id: string; kind: 'humanoid' | 'box'; name: string;
  dimensions: Vec3; position: Vec3; rotation: Vec3; scale: Vec3; referenceAssetIds: string[];
  hidden?: boolean;
  appearance?: 'spider';
}
export interface ImageRequest { id: string; prompt: string; guideAssetId?: string; count?: 1 | 3 }
export interface Generation {
  guideAssetId: string; sourceSignature: string; jobId?: string; outputAssetId?: string; instructions?: string;
  imageRequest?: ImageRequest; imageAssetIds?: string[]; referenceAssetIds?: string[];
  imageSources?: Record<string, string>; baselineAssetId?: string;
}
export interface ShotCamera { position: Vec3; rotation: Vec3 }
export interface Project {
  version: 2;
  id: string;
  rig: 'take-one-mannequin-v1';
  name: string;
  duration: number;
  fps: 30;
  objects: SceneObject[];
  demo: boolean;
  tracks: Track[];
  clips?: AnimationClip[];
  camera?: ShotCamera;
  generation?: Generation;
}
export interface BoneDefinition { id: string; name: string; parent: string | null; offset: Vec3; rest: Vec3 }
export const BONES: BoneDefinition[] = [
  { id: 'hips', name: 'Hips', parent: null, offset: [0, 1.02, 0], rest: [0, 0, 0] },
  { id: 'spine', name: 'Spine', parent: 'hips', offset: [0, .15, 0], rest: [0, 0, 0] },
  { id: 'chest', name: 'Chest', parent: 'spine', offset: [0, .22, 0], rest: [0, 0, 0] },
  { id: 'neck', name: 'Neck', parent: 'chest', offset: [0, .20, 0], rest: [0, 0, 0] },
  { id: 'head', name: 'Head', parent: 'neck', offset: [0, .10, 0], rest: [0, 0, 0] },
  { id: 'arm.L', name: 'Left upper arm', parent: 'chest', offset: [.25, .09, 0], rest: [0, 0, 12] },
  { id: 'forearm.L', name: 'Left forearm', parent: 'arm.L', offset: [0, -.30, 0], rest: [-8, 0, 0] },
  { id: 'hand.L', name: 'Left hand', parent: 'forearm.L', offset: [0, -.26, 0], rest: [0, 0, 0] },
  { id: 'arm.R', name: 'Right upper arm', parent: 'chest', offset: [-.25, .09, 0], rest: [0, 0, -12] },
  { id: 'forearm.R', name: 'Right forearm', parent: 'arm.R', offset: [0, -.30, 0], rest: [-8, 0, 0] },
  { id: 'hand.R', name: 'Right hand', parent: 'forearm.R', offset: [0, -.26, 0], rest: [0, 0, 0] },
  { id: 'thigh.L', name: 'Left thigh', parent: 'hips', offset: [.12, -.04, 0], rest: [0, 0, -3] },
  { id: 'shin.L', name: 'Left shin', parent: 'thigh.L', offset: [0, -.43, 0], rest: [0, 0, 0] },
  { id: 'foot.L', name: 'Left foot', parent: 'shin.L', offset: [0, -.43, 0], rest: [0, 0, 0] },
  { id: 'thigh.R', name: 'Right thigh', parent: 'hips', offset: [-.12, -.04, 0], rest: [0, 0, 3] },
  { id: 'shin.R', name: 'Right shin', parent: 'thigh.R', offset: [0, -.43, 0], rest: [0, 0, 0] },
  { id: 'foot.R', name: 'Right foot', parent: 'shin.R', offset: [0, -.43, 0], rest: [0, 0, 0] },
];

export const uid = () => crypto.randomUUID();
export const HUMANOID_ID = 'humanoid';
export const CAMERA_ID = '__shot_camera__';
export function makeCamera(): ShotCamera {
  const position: Vec3 = [3.1, 2.1, 5.2];
  const rotation = fromQuaternion(new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(...position), new Vector3(0, .95, 0), new Vector3(0, 1, 0))));
  return { position, rotation };
}
export const hasTarget = (project: Project, id: string) => id === CAMERA_ID ? !!project.camera : project.objects.some(o => o.id === id && !o.hidden);
export const primaryTarget = (project: Project) => project.objects.find(o => !o.hidden)?.id ?? (project.camera ? CAMERA_ID : HUMANOID_ID);
export const hasCharacter = (project: Project) => project.objects.some(o => o.kind === 'humanoid' && !o.hidden);
export function makeObject(kind: SceneObject['kind'], count = 0): SceneObject {
  return { id: kind === 'humanoid' ? HUMANOID_ID : uid(), kind, name: kind === 'humanoid' ? 'Mannequin' : `Box ${count + 1}`,
    dimensions: kind === 'humanoid' ? [.7, 1.9, .4] : [1, 1, 1], position: kind === 'humanoid' ? [0, 0, 0] : [1.5 + count % 4 * 1.25, 0, -Math.floor(count / 4) * 1.25 || 0], rotation: [0, 0, 0], scale: [1, 1, 1], referenceAssetIds: [] };
}
export const trackId = (target: string, channel: Channel) => `${target}:${channel}`;
export const snapTime = (time: number, duration: number) => Math.round(Math.max(0, Math.min(duration, time)) * 30) / 30;
export function makeProject(): Project {
  return { version: 2, id: uid(), rig: 'take-one-mannequin-v1', name: 'Untitled take', duration: 5, fps: 30, objects: [makeObject('humanoid')], demo: false, tracks: [] };
}
export function defaultValue(target: string, channel: Channel): Vec3 {
  if (channel === 'scale') return [1, 1, 1];
  if (channel === 'rotation' && target !== 'model') return [...(BONES.find(b => b.id === target)?.rest ?? [0, 0, 0])] as Vec3;
  return [0, 0, 0];
}
export function toQuaternion(value: Vec3): Quaternion {
  return new Quaternion().setFromEuler(new Euler(...value.map(MathUtils.degToRad) as Vec3, 'XYZ'));
}
export function fromQuaternion(q: Quaternion): Vec3 {
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z].map(MathUtils.radToDeg) as Vec3;
}
// Keep the nearest equivalent Euler representation, including accumulated turns.
export function unwrapRotation(value: Vec3, reference: Vec3): Vec3 {
  const candidates: Vec3[] = [value, [value[0] + 180, 180 - value[1], value[2] + 180]];
  if (Math.abs(Math.cos(MathUtils.degToRad(value[1]))) < 1e-7) {
    candidates.push([value[0] - Math.sign(value[1]) * reference[2], value[1], reference[2]]);
  }
  return candidates.map(candidate => candidate.map((v, i) => v + 360 * Math.round((reference[i] - v) / 360)) as Vec3)
    .sort((a, b) => a.reduce((sum, v, i) => sum + (v - reference[i]) ** 2, 0) - b.reduce((sum, v, i) => sum + (v - reference[i]) ** 2, 0))[0];
}
function pointOnRotationPath(path: Vec3[], progress: number): { index: number; value: Vec3 } {
  if (progress <= 0) return { index: 0, value: [...path[0]] };
  if (progress >= 1) return { index: path.length - 2, value: [...path[path.length - 1]] };
  const rotations = path.map(toQuaternion);
  const lengths = rotations.slice(1).map((q, i) => rotations[i].angleTo(q));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 1e-9 && remaining <= lengths[i]) {
      const t = remaining / lengths[i];
      const reference = path[i].map((v, axis) => MathUtils.lerp(v, path[i + 1][axis], t)) as Vec3;
      return { index: i, value: unwrapRotation(fromQuaternion(rotations[i].slerp(rotations[i + 1], t)), reference) };
    }
    remaining -= lengths[i];
  }
  return { index: path.length - 2, value: [...path[path.length - 1]] };
}
export function sampleTrack(track: Track | undefined, time: number, fallback: Vec3): Vec3 {
  if (!track?.keys.length) return [...fallback];
  const keys = track.keys;
  if (time <= keys[0].time) return [...keys[0].value];
  const last = keys[keys.length - 1];
  if (time >= last.time) return [...last.value];
  const next = keys.findIndex(k => k.time > time);
  const a = keys[next - 1], b = keys[next];
  let t = (time - a.time) / (b.time - a.time);
  t = easeProgress(a.ease, t, a.easePower);
  if (track.channel === 'rotation' && b.rotationPath) return pointOnRotationPath(b.rotationPath, t).value;
  // Numeric rotation keys retain their signed angles: 0 -> 360 is a full turn.
  return a.value.map((v, i) => MathUtils.lerp(v, b.value[i], t)) as Vec3;
}
export function easeProgress(ease: Ease, t: number, power = 2) {
  const exponent = Math.max(.25, Math.min(4, Number.isFinite(power) ? power : 2));
  return ease === 'smooth' ? t * t * (3 - 2 * t) : ease === 'ease-in' ? t ** exponent : ease === 'ease-out' ? 1 - (1 - t) ** exponent : t;
}
export function sample(project: Project, target: string, channel: Channel, time: number, objectId = HUMANOID_ID): Vec3 {
  const object = project.objects.find(o => o.id === objectId);
  const cameraValue = objectId === CAMERA_ID && channel !== 'scale' ? project.camera?.[channel] : undefined;
  const fallback = cameraValue ?? (target === 'model' && object ? object[channel] : defaultValue(target, channel));
  const clip = clipAt(project, time, objectId);
  return sampleTrack((clip?.tracks ?? project.tracks).find(t => t.objectId === objectId && t.target === target && t.channel === channel),
    clip ? clipSourceTime(clip, time) : time, fallback);
}
// Between blocks, hold the previous end pose. Motion only advances inside a block.
export function clipAt(project: Project, time: number, objectId: string) {
  let found: AnimationClip | undefined;
  for (const clip of project.clips ?? []) if (clip.objectId === objectId && clip.start <= time && (!found || clip.start > found.start)) found = clip;
  return found;
}
export const clipSourceTime = (clip: AnimationClip, time: number) => clip.sourceStart + Math.max(0, Math.min(1, (time - clip.start) / clip.duration)) * (clip.sourceEnd - clip.sourceStart);
export const clipSceneTime = (clip: AnimationClip, time: number) => clip.start + (time - clip.sourceStart) / (clip.sourceEnd - clip.sourceStart) * clip.duration;
// Capture the incoming route up to the playhead before extending it with a drag.
export function rotationPathTo(project: Project, target: string, time: number, objectId = HUMANOID_ID): Vec3[] {
  const clip = clipAt(project, time, objectId);
  if (clip) return rotationPathTo({ ...project, clips: undefined, tracks: clip.tracks, duration: clip.sourceDuration }, target, clipSourceTime(clip, time), objectId);
  const at = snapTime(time, project.duration);
  const track = project.tracks.find(t => t.objectId === objectId && t.target === target && t.channel === 'rotation');
  const previous = track?.keys.filter(k => k.time < at).at(-1);
  const value = sample(project, target, 'rotation', at, objectId);
  if (!previous) return [value];
  const next = track?.keys.find(k => k.time >= at);
  if (next?.rotationPath) {
    let progress = (at - previous.time) / (next.time - previous.time);
    progress = easeProgress(previous.ease, progress, previous.easePower);
    const point = pointOnRotationPath(next.rotationPath, progress);
    return [...next.rotationPath.slice(0, point.index + 1).map(v => [...v] as Vec3), value];
  }
  const steps = Math.max(1, Math.ceil(Math.max(...value.map((v, i) => Math.abs(v - previous.value[i]))) / 10));
  return Array.from({ length: steps + 1 }, (_, step) => previous.value.map((v, i) => MathUtils.lerp(v, value[i], step / steps)) as Vec3);
}
export function putKey(project: Project, target: string, channel: Channel, time: number, value: Vec3, ease: Ease = 'smooth', rotationPath?: Vec3[], objectId = HUMANOID_ID): Project {
  const next = structuredClone(project);
  let track = next.tracks.find(t => t.objectId === objectId && t.target === target && t.channel === channel);
  if (!track) { track = { objectId, target, channel, keys: [] }; next.tracks.push(track); }
  const at = snapTime(time, next.duration);
  const existing = track.keys.find(k => Math.abs(k.time - at) < 1 / 60);
  const sameValue = existing?.value.every((v, i) => v === value[i]);
  const previous = track.keys.filter(k => k.time < at).at(-1);
  const sampled = sample(next, target, channel, at, objectId);
  const incoming = channel === 'rotation' && previous
    ? rotationPath ?? (sampled.every((v, i) => v === value[i]) ? rotationPathTo(next, target, at, objectId) : undefined)
    : undefined;
  if (existing) { existing.value = [...value]; existing.ease = ease; }
  else track.keys.push({ id: uid(), time: at, value: [...value], ease });
  track.keys.sort((a, b) => a.time - b.time);
  const key = existing ?? track.keys.find(k => k.time === at)!;
  if (incoming) key.rotationPath = incoming.map(v => [...v] as Vec3);
  else if (!sameValue) delete key.rotationPath;
  // A changed start pose must not leave the next key pointing at a stale route.
  if (!sameValue) {
    const following = track.keys.find(k => k.time > at);
    if (following) delete following.rotationPath;
  }
  return next;
}
export function moveKey(project: Project, id: string, time: number): Project {
  const next = structuredClone(project);
  for (const track of next.tracks) {
    const key = track.keys.find(k => k.id === id);
    if (!key) continue;
    const predecessors = new Map(track.keys.map((k, i) => [k.id, track.keys[i - 1]?.id]));
    key.time = snapTime(time, next.duration);
    track.keys = track.keys.filter(k => k.id === id || Math.abs(k.time - key.time) >= 1 / 60).sort((a, b) => a.time - b.time);
    track.keys.forEach((k, i) => { if (predecessors.get(k.id) !== track.keys[i - 1]?.id) delete k.rotationPath; });
  }
  return next;
}
export function seedIdle(project: Project): Project {
  if (!project.objects.some(o => o.kind === 'humanoid') && project.objects.length >= 32) throw new Error('The scene is full. Delete a box before adding the demo humanoid.');
  let next = { ...structuredClone(project), demo: true, name: project.name === 'Untitled take' ? 'A moment, held' : project.name };
  if (!next.objects.some(o => o.kind === 'humanoid')) next.objects.push(makeObject('humanoid'));
  next.objects = next.objects.map(o => o.kind === 'humanoid' ? { ...o, hidden: false } : o);
  next.tracks = next.tracks.filter(t => t.objectId !== HUMANOID_ID || t.target === 'model');
  if (next.clips) next.clips = next.clips.filter(clip => clip.objectId !== HUMANOID_ID);
  const poses: Record<string, Vec3[]> = {
    spine: [[0, 0, -2], [2, 0, 0], [0, 0, 2], [-1, 0, 0], [0, 0, -2]],
    chest: [[0, -2, 1], [-2, 0, 0], [0, 2, -1], [1, 0, 0], [0, -2, 1]],
    head: [[-2, -5, 0], [1, 0, 2], [0, 6, 0], [-1, 0, -1], [-2, -5, 0]],
    'arm.L': [[0, 0, 12], [3, 0, 14], [0, 0, 12], [-3, 0, 10], [0, 0, 12]],
    'arm.R': [[0, 0, -12], [-3, 0, -10], [0, 0, -12], [3, 0, -14], [0, 0, -12]],
    'forearm.L': [[-8, 0, 0], [-12, 0, 0], [-8, 0, 0], [-5, 0, 0], [-8, 0, 0]],
    'forearm.R': [[-8, 0, 0], [-5, 0, 0], [-8, 0, 0], [-12, 0, 0], [-8, 0, 0]],
  };
  for (const [target, values] of Object.entries(poses)) {
    for (let i = 0; i < values.length; i++) next = putKey(next, target, 'rotation', project.duration * i / 4, values[i]);
  }
  return next;
}

// Explicit portable format. Never trust imported files to name arbitrary joints or supply non-finite transforms.
export function parseProject(raw: string): Project {
  let p = JSON.parse(raw);
  if (p?.version === 1) {
    if (typeof p.hasCharacter !== 'boolean' || !Array.isArray(p.tracks) || p.tracks.length > 20) throw new Error('Invalid legacy scene.');
    const { hasCharacter: visible, ...legacy } = p;
    p = { ...legacy, version: 2, id: uid(), objects: [{ ...makeObject('humanoid'), hidden: !visible }], tracks: p.tracks.map((t: Track) => ({ ...t, objectId: HUMANOID_ID })) };
  }
  return validateProject(p);
}
export const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
export const validVec = (v: unknown, min = -10000, max = 10000): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
export function validateProject(input: unknown): Project {
  const p = structuredClone(input) as Project;
  if (!p || p.version !== 2 || !validId(p.id) || p.rig !== 'take-one-mannequin-v1' || p.fps !== 30 || typeof p.name !== 'string' || p.name.length > 120 ||
    !Number.isFinite(p.duration) || p.duration < 2 || p.duration > 10 || typeof p.demo !== 'boolean' ||
    !Array.isArray(p.objects) || p.objects.length > 32 || !Array.isArray(p.tracks) || p.tracks.length > 115) throw new Error('This file is not a compatible composition scene.');
  if (p.camera !== undefined && (!p.camera || !validVec(p.camera.position) || !validVec(p.camera.rotation))) throw new Error('Invalid camera pose.');
  const objects = new Map<string, SceneObject>();
  for (const o of p.objects) {
    if (!o || !validId(o.id) || o.id === CAMERA_ID || objects.has(o.id) || !['humanoid', 'box'].includes(o.kind) ||
      (o.kind === 'humanoid' ? o.id !== HUMANOID_ID : o.id === HUMANOID_ID) || typeof o.name !== 'string' || !o.name.trim() || o.name.length > 120 ||
      !validVec(o.dimensions, .05, 20) || !validVec(o.position) || !validVec(o.rotation) || !validVec(o.scale, .05, 10) ||
      !Array.isArray(o.referenceAssetIds) || o.referenceAssetIds.length > 9 || !o.referenceAssetIds.every(validId) ||
      (o.hidden !== undefined && typeof o.hidden !== 'boolean') ||
      (o.appearance !== undefined && (o.appearance !== 'spider' || o.kind !== 'humanoid'))) throw new Error('Invalid scene object.');
    objects.set(o.id, o);
  }
  if (p.generation && (!validId(p.generation.guideAssetId) || typeof p.generation.sourceSignature !== 'string' || p.generation.sourceSignature.length > 100 ||
    (p.generation.jobId !== undefined && !validId(p.generation.jobId)) || (p.generation.outputAssetId !== undefined && !validId(p.generation.outputAssetId)) ||
    (p.generation.imageRequest !== undefined && (!p.generation.imageRequest || !validId(p.generation.imageRequest.id) || typeof p.generation.imageRequest.prompt !== 'string' || !p.generation.imageRequest.prompt.trim() || p.generation.imageRequest.prompt.length > 4000 ||
      (p.generation.imageRequest.guideAssetId !== undefined && !validId(p.generation.imageRequest.guideAssetId)) || (p.generation.imageRequest.count !== undefined && ![1, 3].includes(p.generation.imageRequest.count)))) ||
    (p.generation.imageAssetIds !== undefined && (!Array.isArray(p.generation.imageAssetIds) || p.generation.imageAssetIds.length > 24 || !p.generation.imageAssetIds.every(validId))) ||
    (p.generation.referenceAssetIds !== undefined && (!Array.isArray(p.generation.referenceAssetIds) || p.generation.referenceAssetIds.length > 9 || !p.generation.referenceAssetIds.every(validId))) ||
    (p.generation.imageSources !== undefined && (!p.generation.imageSources || typeof p.generation.imageSources !== 'object' || Array.isArray(p.generation.imageSources) || Object.keys(p.generation.imageSources).length > 24 || !Object.entries(p.generation.imageSources).every(([assetId, guideId]) => validId(assetId) && validId(guideId) && p.generation!.imageAssetIds?.includes(assetId)))) ||
    (p.generation.baselineAssetId !== undefined && (!validId(p.generation.baselineAssetId) || !p.generation.imageSources?.[p.generation.baselineAssetId])) ||
    (p.generation.instructions !== undefined && (typeof p.generation.instructions !== 'string' || p.generation.instructions.length > 4000)))) throw new Error('Invalid generation assets.');
  const known = new Set(BONES.map(b => b.id)), seenTracks = new Set<string>(), seenKeys = new Set<string>();
  for (const track of p.tracks) {
    if (!track || !['position', 'rotation', 'scale'].includes(track.channel) || !Array.isArray(track.keys) || track.keys.length > 1000 ||
      (track.objectId === CAMERA_ID ? (!p.camera || track.target !== 'model' || track.channel === 'scale') :
        (!objects.has(track.objectId) || (track.target !== 'model' && (objects.get(track.objectId)?.kind !== 'humanoid' || !known.has(track.target) || track.channel !== 'rotation'))))) throw new Error('Unsupported object or bone track.');
    const id = `${track.objectId}:${trackId(track.target, track.channel)}`;
    if (seenTracks.has(id)) throw new Error('Duplicate animation track.');
    seenTracks.add(id);
    let previous = -1;
    let previousValue: Vec3 | undefined;
    for (const key of [...track.keys].sort((a, b) => a.time - b.time)) {
      if (!key || !validId(key.id) || seenKeys.has(key.id) || !Number.isFinite(key.time) || key.time < 0 || key.time > p.duration ||
        Math.abs(key.time * 30 - Math.round(key.time * 30)) > .0001 || key.time <= previous || !['linear', 'smooth', 'ease-in', 'ease-out'].includes(key.ease) ||
        (key.easePower !== undefined && (!Number.isFinite(key.easePower) || key.easePower < .25 || key.easePower > 4)) ||
        !validVec(key.value) ||
        (track.channel === 'scale' && key.value.some(v => v < .05 || v > 10))) throw new Error('Invalid keyframe values.');
      if (key.rotationPath !== undefined) {
        const path = key.rotationPath;
        if (track.channel !== 'rotation' || !previousValue || !Array.isArray(path) || path.length < 2 || path.length > MAX_ROTATION_PATH_POINTS ||
          !path.every(v => validVec(v)) ||
          !path[0].every((v, i) => Math.abs(v - previousValue![i]) < .0001) ||
          !path[path.length - 1].every((v, i) => Math.abs(v - key.value[i]) < .0001)) throw new Error('Invalid rotation path.');
      }
      previous = key.time; previousValue = key.value; seenKeys.add(key.id);
    }
    track.keys.sort((a, b) => a.time - b.time);
  }
  if (p.clips !== undefined) {
    if (!Array.isArray(p.clips) || p.clips.length > 64) throw new Error('Too many animation blocks.');
    const ids = new Set<string>(), ends = new Map<string, number>();
    p.clips.sort((a, b) => (a?.start ?? 0) - (b?.start ?? 0));
    for (const clip of p.clips) {
      if (!clip || !validId(clip.id) || ids.has(clip.id) || !hasTarget(p, clip.objectId) || typeof clip.name !== 'string' || !clip.name.trim() || clip.name.length > 120 ||
        !['prepared', 'ai', 'edited'].includes(clip.source) || !Number.isFinite(clip.start) || clip.start < 0 || !Number.isFinite(clip.duration) || clip.duration < 1 / 30 - 1e-8 ||
        clip.start + clip.duration > p.duration + 1e-8 || Math.abs(clip.start * 30 - Math.round(clip.start * 30)) > .0001 || Math.abs(clip.duration * 30 - Math.round(clip.duration * 30)) > .0001 ||
        !Number.isFinite(clip.sourceDuration) || clip.sourceDuration < 1 / 30 || clip.sourceDuration > 10 || !Number.isFinite(clip.sourceStart) || !Number.isFinite(clip.sourceEnd) ||
        clip.sourceStart < 0 || clip.sourceEnd > clip.sourceDuration + 1e-8 || clip.sourceEnd - clip.sourceStart < 1e-8 ||
        (ends.get(clip.objectId) ?? 0) > clip.start + 1e-8 || !Array.isArray(clip.tracks)) throw new Error('Invalid or overlapping animation blocks.');
      if (clip.tracks.some(t => t.objectId !== clip.objectId || t.keys.some(k => k.time > clip.sourceDuration + 1e-8))) throw new Error('Invalid animation block tracks.');
      validateProject({ ...p, clips: undefined, duration: Math.max(2, clip.sourceDuration), tracks: clip.tracks });
      if (clip.web && (!validVec(clip.web.anchor) || !Number.isFinite(clip.web.start) || !Number.isFinite(clip.web.end) || clip.web.start < 0 || clip.web.end <= clip.web.start || clip.web.end > clip.sourceDuration)) throw new Error('Invalid web timing.');
      ids.add(clip.id); ends.set(clip.objectId, clip.start + clip.duration);
    }
  }
  return p;
}
