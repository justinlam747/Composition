import { Quaternion, Vector3 } from 'three';
import { CAMERA_ID, fromQuaternion, toQuaternion, uid, unwrapRotation, type AnimationAsset, type ShotCamera, type Vec3 } from './project';
import { validateAnimation } from './clips';
import type { PhonePose } from './phoneProtocol';

export interface MotionSample { time: number; position: Vec3; quaternion: [number, number, number, number] }
export function interpolateMotionSample(a: MotionSample, b: MotionSample, time: number): MotionSample {
  const alpha = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
  return { time, position: new Vector3(...a.position).lerp(new Vector3(...b.position), alpha).toArray() as Vec3,
    quaternion: new Quaternion(...a.quaternion).slerp(new Quaternion(...b.quaternion), alpha).toArray() };
}
export function alignPhone(origin: PhonePose, camera: ShotCamera) {
  // One rigid transform preserves real distances and keeps the scene anchored.
  const rotation = toQuaternion(camera.rotation).multiply(new Quaternion(...origin.quaternion).normalize().invert());
  return (pose: PhonePose): MotionSample => ({ time: pose.time,
    position: new Vector3(...pose.position).sub(new Vector3(...origin.position)).applyQuaternion(rotation).add(new Vector3(...camera.position)).toArray() as Vec3,
    quaternion: rotation.clone().multiply(new Quaternion(...pose.quaternion).normalize()).toArray(),
  });
}

export function cameraTake(samples: MotionSample[]): AnimationAsset {
  if (samples.length < 2) throw new Error('Record a little more movement before saving a take.');
  const first = samples[0].time;
  for (let i = 1; i < samples.length; i++) {
    const gap = samples[i].time - samples[i - 1].time;
    if (gap <= 0 || gap > .35) throw new Error('Tracking contains a gap. Start a new take.');
  }
  const frames = Math.floor((samples.at(-1)!.time - first + 1e-7) * 30);
  if (frames < 1 || frames > 300) throw new Error('Record between one frame and ten seconds.');
  const duration = frames / 30;
  const positions: Vec3[] = [], rotations: Vec3[] = [];
  let cursor = 1;
  for (let frame = 0; frame <= frames; frame++) {
    const time = first + frame / 30;
    while (cursor < samples.length - 1 && samples[cursor].time < time) cursor++;
    const pose = interpolateMotionSample(samples[cursor - 1], samples[cursor], time);
    positions.push(pose.position);
    const rotation = fromQuaternion(new Quaternion(...pose.quaternion));
    rotations.push(rotations.length ? unwrapRotation(rotation, rotations.at(-1)!) : rotation);
  }
  return validateAnimation({ id: uid(), name: 'Phone camera take', kind: 'camera', source: 'edited', duration,
    tracks: (['position', 'rotation'] as const).map((channel, index) => ({ objectId: CAMERA_ID, target: 'model', channel,
      keys: (index ? rotations : positions).map((value, frame) => ({ id: uid(), time: frame / 30, value, ease: 'linear' as const,
        ...(channel === 'rotation' && frame > 0 ? { rotationPath: [rotations[frame - 1], value] } : {}),
      })),
    })),
  });
}
