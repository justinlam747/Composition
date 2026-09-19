import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { BONES, HUMANOID_ID, makeObject, type AnimationAsset, type Project, type Vec3 } from './project';
import { insertClip } from './clips';

type Pose = Record<string, Vec3>;
type Frame = { time: number; position: Vec3; rotation?: Vec3; pose?: Pose };
const crouch: Pose = { hips: [15, 0, 0], spine: [25, 0, 0], chest: [20, 0, 0], head: [-25, 0, 0],
  'thigh.L': [-75, 0, -20], 'thigh.R': [-75, 0, 20], 'shin.L': [110, 0, 0], 'shin.R': [110, 0, 0],
  'arm.L': [-35, 0, 35], 'arm.R': [-60, 0, -25], 'forearm.L': [-40, 0, 0], 'forearm.R': [-25, 0, 0] };
const webPose: Pose = { chest: [-12, -15, 0], head: [-25, -10, 0], 'arm.R': [-150, 0, -15], 'forearm.R': [-8, 0, 0], 'hand.R': [15, 0, 0],
  'arm.L': [20, 0, 20], 'forearm.L': [-40, 0, 0] };
function animation(id: string, name: string, duration: number, frames: Frame[], web?: AnimationAsset['web']): AnimationAsset {
  const keyed = (target: string, channel: 'position' | 'rotation', values: Vec3[]) => ({ objectId: HUMANOID_ID, target, channel,
    keys: frames.map((frame, index) => ({ id: `${id}-${target.replace('.', '_')}-${channel}-${index}`, time: frame.time, value: values[index], ease: 'smooth' as const })) });
  return { id, name, kind: 'humanoid', source: 'prepared', duration,
    tracks: [keyed('model', 'position', frames.map(frame => frame.position)), keyed('model', 'rotation', frames.map(frame => frame.rotation ?? [0, 0, 0])),
      ...BONES.map(bone => keyed(bone.id, 'rotation', frames.map(frame => frame.pose?.[bone.id] ?? bone.rest)))], ...(web ? { web } : {}) };
}
export const spiderAnimations: AnimationAsset[] = [
  animation('spider-drop-v1', 'Drop to floor', 2, [
    { time: 0, position: [-2, 3.2, 0], pose: { 'arm.L': [-130, 0, 25], 'arm.R': [-130, 0, -25], 'thigh.L': [-30, 0, -12], 'thigh.R': [-30, 0, 12], 'shin.L': [55, 0, 0], 'shin.R': [55, 0, 0] } },
    { time: .7, position: [-2, 1.6, 0], pose: { 'arm.L': [-50, 0, 45], 'arm.R': [-50, 0, -45], 'thigh.L': [-45, 0, -18], 'thigh.R': [-45, 0, 18], 'shin.L': [75, 0, 0], 'shin.R': [75, 0, 0] } },
    { time: 1, position: [-2, -.25617, 0], pose: crouch },
    { time: 1.3, position: [-2, -.25617, 0], pose: crouch },
    { time: 2, position: [-2, 0, 0] },
  ]),
  animation('spider-web-v1', 'Shoot web', 1.5, [
    { time: 0, position: [-2, 0, 0] },
    { time: .4, position: [-2, 0, 0], pose: { ...webPose, 'arm.R': [-60, 0, -25], 'forearm.R': [-100, 0, 0] } },
    { time: .6, position: [-2, 0, 0], pose: webPose },
    { time: 1.5, position: [-2, 0, 0], pose: webPose },
  ], { anchor: [0, 5.4, 0], start: .6, end: 1.5 }),
  animation('spider-swing-v1', 'Swing and land', 5.5, [
    { time: 0, position: [-2, 0, 0], pose: webPose },
    { time: .6, position: [-1.8, .8, 0], rotation: [0, 0, -15], pose: { ...webPose, 'thigh.L': [-55, 0, -10], 'thigh.R': [-35, 0, 15], 'shin.L': [90, 0, 0], 'shin.R': [60, 0, 0] } },
    { time: 1.5, position: [-.7, 1.6, 0], rotation: [0, 0, -20], pose: { ...webPose, 'thigh.L': [-65, 0, -10], 'thigh.R': [-45, 0, 15], 'shin.L': [100, 0, 0], 'shin.R': [70, 0, 0] } },
    { time: 2.5, position: [.8, 1.3, 0], rotation: [0, 0, 15], pose: { ...webPose, 'thigh.L': [25, 0, -10], 'thigh.R': [10, 0, 15], 'shin.L': [40, 0, 0], 'shin.R': [20, 0, 0] } },
    { time: 3.2, position: [2, .9, 0], rotation: [0, 0, 25], pose: { ...webPose, 'arm.R': [-100, 0, -40], 'arm.L': [-50, 0, 45], 'thigh.L': [-35, 0, -15], 'thigh.R': [-35, 0, 15], 'shin.L': [60, 0, 0], 'shin.R': [60, 0, 0] } },
    { time: 4, position: [3, -.25617, 0], pose: crouch },
    { time: 4.4, position: [3, -.25617, 0], pose: crouch },
    { time: 5.5, position: [3, 0, 0] },
  ], { anchor: [0, 5.4, 0], start: 0, end: 3.2 }),
];

// Baked ground-contact offsets for this mannequin's crouch-to-stand pose.
// Root keys stay editable; playback does not add hidden grounding corrections.
const recoveryY = [-.25617, -.23815, -.1921, -.13197, -.07187, -.02355, .00587, .01498, .01039, .0032, 0];
for (const [asset, start] of [[spiderAnimations[0], 1.3], [spiderAnimations[2], 4.4]] as const) {
  const track = asset.tracks.find(value => value.target === 'model' && value.channel === 'position')!;
  const end = track.keys.at(-1)!.value;
  track.keys = track.keys.filter(key => key.time < start);
  for (let frame = Math.round(start * 30); frame <= Math.round(asset.duration * 30); frame++) {
    const time = frame / 30, progress = (time - start) / (asset.duration - start) * 10, index = Math.min(9, Math.floor(progress));
    const y = MathUtils.lerp(recoveryY[index], recoveryY[index + 1], progress - index);
    track.keys.push({ id: `${asset.id}-contact-${frame}`, time, value: [end[0], y, end[2]], ease: 'linear' });
  }
}

export function loadSpiderDemo(project: Project, animations: AnimationAsset[] = spiderAnimations): Project {
  const character = project.objects.find(object => object.id === HUMANOID_ID) ?? makeObject('humanoid');
  if (!project.objects.some(object => object.id === HUMANOID_ID) && project.objects.length >= 32) throw new Error('Remove an object before adding the demo character.');
  const position: Vec3 = [.5, 2.8, 8.8];
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(...position), new Vector3(.5, 2.5, 0), new Vector3(0, 1, 0)));
  const euler = new Euler().setFromQuaternion(q);
  let next: Project = { ...project, name: animations.some(asset => asset.source === 'ai') ? 'Spider-Man — Hunyuan Motion' : 'Spider-Man — three beats', duration: 10, demo: true,
    camera: { position, rotation: [euler.x, euler.y, euler.z].map(MathUtils.radToDeg) as Vec3 },
    objects: [...project.objects.filter(object => object.id !== HUMANOID_ID), { ...character, hidden: false, appearance: 'spider', name: 'Spider-Man demo', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
    tracks: project.tracks.filter(track => track.objectId !== HUMANOID_ID && track.objectId !== '__shot_camera__'),
    clips: project.clips?.filter(clip => clip.objectId !== HUMANOID_ID && clip.objectId !== '__shot_camera__') ?? [] };
  let start = 0;
  for (const asset of animations) { next = insertClip(next, asset, HUMANOID_ID, start); start += asset.duration; }
  return next;
}
