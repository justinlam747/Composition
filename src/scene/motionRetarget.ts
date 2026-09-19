import { AnimationMixer, Bone, LoopOnce, Object3D, Quaternion, Vector3 } from 'three';
import { BONES, HUMANOID_ID, defaultValue, type AnimationAsset, type Track, type Vec3, unwrapRotation } from '../core/project';
import { validateAnimation } from '../core/clips';
import type { Mannequin } from './mannequin';

// HY-Motion's SMPL-H skeleton has more joints than the editor. World-space
// matching folds the extra spine and collar rotations into the mapped controls.
const mappings: Record<string, [string, string | null, string | null]> = {
  hips: ['Pelvis', 'Spine1', 'spine'], spine: ['Spine1', 'Spine2', 'chest'],
  chest: ['Spine3', 'Neck', 'neck'], neck: ['Neck', 'Head', 'head'], head: ['Head', null, null],
  'arm.L': ['L_Shoulder', 'L_Elbow', 'forearm.L'], 'forearm.L': ['L_Elbow', 'L_Wrist', 'hand.L'], 'hand.L': ['L_Wrist', 'L_Middle1', null],
  'arm.R': ['R_Shoulder', 'R_Elbow', 'forearm.R'], 'forearm.R': ['R_Elbow', 'R_Wrist', 'hand.R'], 'hand.R': ['R_Wrist', 'R_Middle1', null],
  'thigh.L': ['L_Hip', 'L_Knee', 'shin.L'], 'shin.L': ['L_Knee', 'L_Ankle', 'foot.L'], 'foot.L': ['L_Ankle', 'L_Foot', null],
  'thigh.R': ['R_Hip', 'R_Knee', 'shin.R'], 'shin.R': ['R_Knee', 'R_Ankle', 'foot.R'], 'foot.R': ['R_Ankle', 'R_Foot', null],
};
const position = (object: Object3D) => object.getWorldPosition(new Vector3());
const orientation = (object: Object3D) => object.getWorldQuaternion(new Quaternion()).normalize();

export function retargetHunyuanMotion(source: Object3D, target: Mannequin, options: { id: string; name: string; duration: number }): AnimationAsset {
  const clip = source.animations[0];
  if (!clip?.tracks.length || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error('Motion file has no playable animation.');
  if (!Number.isFinite(options.duration) || options.duration < 1 / 30 || options.duration > 10 || Math.abs(options.duration * 30 - Math.round(options.duration * 30)) > 1e-5) throw new Error('Unsupported animation duration.');
  const sourceBones = new Map<string, Bone>();
  source.traverse(object => { if (object instanceof Bone && !sourceBones.has(object.name)) sourceBones.set(object.name, object); });
  for (const names of Object.values(mappings)) if (!sourceBones.has(names[0]) || names[1] && !sourceBones.has(names[1])) throw new Error(`Unsupported motion skeleton: missing ${names[0]}.`);
  source.updateMatrixWorld(true);
  target.root.position.set(0, 0, 0); target.root.quaternion.identity(); target.root.scale.set(1, 1, 1);
  for (const definition of BONES) target.setJointPose(definition.id, definition.rest);
  target.root.updateMatrixWorld(true);
  const corrections = new Map<string, Quaternion>();
  for (const definition of BONES) {
    const [name, childName, targetChild] = mappings[definition.id];
    const input = sourceBones.get(name)!, output = target.bones.get(definition.id)!;
    const inputRest = orientation(input), outputRest = orientation(output);
    const inputDirection = childName ? position(sourceBones.get(childName)!).sub(position(input)).normalize() : new Vector3(0, 1, 0).applyQuaternion(inputRest);
    const outputDirection = targetChild ? position(target.bones.get(targetChild)!).sub(position(output)).normalize() : new Vector3(0, 1, 0).applyQuaternion(outputRest);
    const align = new Quaternion().setFromUnitVectors(outputDirection, inputDirection);
    corrections.set(definition.id, inputRest.clone().invert().multiply(align).multiply(outputRest));
  }
  const sourceHip = sourceBones.get('Pelvis')!;
  const sourceLeg = position(sourceBones.get('L_Hip')!).distanceTo(position(sourceBones.get('L_Knee')!)) + position(sourceBones.get('L_Knee')!).distanceTo(position(sourceBones.get('L_Ankle')!));
  const targetLeg = position(target.bones.get('thigh.L')!).distanceTo(position(target.bones.get('shin.L')!)) + position(target.bones.get('shin.L')!).distanceTo(position(target.bones.get('foot.L')!));
  if (sourceLeg < 1e-5) throw new Error('Motion skeleton has invalid limb lengths.');
  const scale = targetLeg / sourceLeg, targetHipHeight = position(target.bones.get('hips')!).y;
  const tracks: Track[] = [
    { objectId: HUMANOID_ID, target: 'model', channel: 'position', keys: [] },
    { objectId: HUMANOID_ID, target: 'model', channel: 'rotation', keys: [] },
    ...BONES.map(definition => ({ objectId: HUMANOID_ID, target: definition.id, channel: 'rotation' as const, keys: [] })),
  ];
  const mixer = new AnimationMixer(source), action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  let initial: Vector3 | undefined;
  try {
    for (let frame = 0; frame <= Math.round(options.duration * 30); frame++) {
      const time = frame / 30;
      mixer.setTime(Math.min(clip.duration - 1e-7, time / options.duration * clip.duration));
      source.updateMatrixWorld(true);
      const hip = position(sourceHip).multiplyScalar(scale); initial ??= hip.clone();
      const rootPosition: Vec3 = [hip.x - initial.x, hip.y - targetHipHeight, hip.z - initial.z];
      tracks[0].keys.push({ id: `${options.id}-p-${frame}`, time, value: rootPosition, ease: 'linear' });
      tracks[1].keys.push({ id: `${options.id}-r-${frame}`, time, value: [0, 0, 0], ease: 'linear' });
      for (let index = 0; index < BONES.length; index++) {
        const definition = BONES[index], output = target.bones.get(definition.id)!;
        const desired = orientation(sourceBones.get(mappings[definition.id][0])!).multiply(corrections.get(definition.id)!);
        output.quaternion.copy(orientation(output.parent!).invert().multiply(desired)).normalize();
        output.updateMatrixWorld(true);
        const track = tracks[index + 2], previous = track.keys.at(-1)?.value;
        const raw = target.readJointPose(definition.id);
        const value = previous ? unwrapRotation(raw, previous) : raw;
        track.keys.push({ id: `${options.id}-${index}-${frame}`, time, value, ease: 'linear' });
      }
    }
    return validateAnimation({ ...options, kind: 'humanoid', source: 'ai', tracks });
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(source);
    for (const definition of BONES) target.setJointPose(definition.id, defaultValue(definition.id, 'rotation'));
    target.root.updateMatrixWorld(true);
  }
}
