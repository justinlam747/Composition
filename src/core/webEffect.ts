import { HUMANOID_ID, clipAt, clipSourceTime, hasCharacter, type Project, type Vec3 } from './project';

export interface WebEffect { anchor: Vec3; progress: number }

export function sampleWebEffect(project: Project, time: number): WebEffect | null {
  const clip = clipAt(project, time, HUMANOID_ID);
  if (!hasCharacter(project) || !clip?.web || time > clip.start + clip.duration) return null;
  const sourceTime = clipSourceTime(clip, time);
  if (sourceTime < clip.web.start || sourceTime > clip.web.end) return null;
  return { anchor: clip.web.anchor, progress: clip.web.start > 0 ? Math.min(1, (sourceTime - clip.web.start) / .15) : 1 };
}
