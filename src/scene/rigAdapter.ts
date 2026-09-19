import { Bone, Quaternion } from 'three';
import { fromQuaternion, toQuaternion, type Vec3 } from '../core/project';

// The imported bind axes differ from our editor axes. Keep all existing keyframe
// values portable by translating rotations through the character's neutral pose.
export function createJointAdapter(bone: Bone, editorRest: Vec3) {
  const restLocal = bone.quaternion.clone().normalize();
  const restFrame = bone.getWorldQuaternion(new Quaternion()).normalize();
  const frameInverse = restFrame.clone().invert();
  const editorNeutral = toQuaternion(editorRest);
  const editorInverse = editorNeutral.clone().invert();
  return {
    apply(value: Vec3) {
      const delta = toQuaternion(value).multiply(editorInverse);
      bone.quaternion.copy(restLocal).multiply(frameInverse).multiply(delta).multiply(restFrame).normalize();
    },
    read(): Vec3 {
      const localDelta = restLocal.clone().invert().multiply(bone.quaternion);
      return fromQuaternion(restFrame.clone().multiply(localDelta).multiply(frameInverse).multiply(editorNeutral).normalize());
    },
  };
}
