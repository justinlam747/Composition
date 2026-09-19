import { putKey, snapTime, type Channel, type Project, type Vec3 } from './project';
import { refineRotationPath, simplifyRotationPath } from './rotationPath';

interface KeyEdit {
  objectId: string; target: string; channel: Channel; time: number; value: Vec3;
  rotationPath?: Vec3[]; gestureStart?: Project;
}

// Numeric edits, gizmos and piloting must preserve the same authored rotation arcs.
export function editTransformKey(project: Project, edit: KeyEdit): Project {
  const { objectId, target, channel, value, rotationPath, gestureStart } = edit;
  const time = snapTime(edit.time, project.duration);
  const matches = (t: Project['tracks'][number]) => t.objectId === objectId && t.target === target && t.channel === channel;
  const currentKey = project.tracks.find(matches)?.keys.find(k => Math.abs(k.time - time) < 1 / 60);
  const incoming = channel === 'rotation' && !rotationPath && currentKey?.rotationPath
    ? simplifyRotationPath(refineRotationPath(currentKey.rotationPath, value)) : rotationPath;
  let next = putKey(project, target, channel, time, value, currentKey?.ease ?? 'smooth', incoming, objectId);
  if (channel === 'rotation') {
    const baseline = (gestureStart ?? project).tracks.find(matches);
    const index = baseline?.keys.findIndex(k => Math.abs(k.time - time) < 1 / 60) ?? -1;
    const following = index >= 0 ? baseline?.keys[index + 1] : undefined;
    if (following?.rotationPath) {
      const adjusted = refineRotationPath(following.rotationPath, value, 'start');
      const route = gestureStart ? adjusted : simplifyRotationPath(adjusted);
      next = { ...next, tracks: next.tracks.map(t => matches(t)
        ? { ...t, keys: t.keys.map(k => k.id === following.id ? { ...k, rotationPath: route } : k) } : t) };
    }
  }
  return next;
}
