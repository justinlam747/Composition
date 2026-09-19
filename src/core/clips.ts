import { CAMERA_ID, HUMANOID_ID, clipSourceTime, makeCamera, makeObject, makeProject, snapTime, uid, validateProject, type AnimationAsset, type AnimationClip, type Project, type Track } from './project';

export function clipProject(project: Project, clip: AnimationClip): Project {
  return { ...project, clips: undefined, tracks: clip.tracks, duration: Math.max(2, clip.sourceDuration) };
}
export function clipPreview(project: Project, id: string | null): Project {
  const selected = project.clips?.find(clip => clip.id === id);
  return selected ? { ...project, clips: project.clips?.filter(clip => clip.objectId !== selected.objectId || clip.id === selected.id) } : project;
}
export function replaceClipTracks(project: Project, id: string, tracks: Track[]): Project {
  return { ...project, clips: project.clips?.map(clip => clip.id === id ? { ...clip, tracks } : clip) };
}
function copyTracks(tracks: Track[], objectId: string) {
  return structuredClone(tracks).map(track => ({ ...track, objectId, keys: track.keys.map(key => ({ ...key, id: uid() })) }));
}
export function validateAnimation(input: unknown): AnimationAsset {
  const asset = structuredClone(input) as AnimationAsset;
  if (!asset || !['humanoid', 'box', 'camera'].includes(asset.kind)) throw new Error('Unsupported animation type.');
  const object = makeObject(asset.kind === 'box' ? 'box' : 'humanoid');
  object.id = asset.kind === 'box' ? 'animation_object' : HUMANOID_ID;
  const objectId = asset.kind === 'camera' ? CAMERA_ID : object.id;
  if (!Array.isArray(asset.tracks)) throw new Error('Invalid animation tracks.');
  const tracks = asset.tracks.map(track => ({ ...track, objectId }));
  validateProject({ ...makeProject(), duration: Math.max(2, asset.range?.duration ?? asset.duration), objects: [object], camera: asset.kind === 'camera' ? makeCamera() : undefined,
    clips: [{ ...asset, objectId, start: 0, sourceDuration: asset.duration, sourceStart: asset.range?.start ?? 0, sourceEnd: asset.range?.end ?? asset.duration, duration: asset.range?.duration ?? asset.duration, tracks }] });
  return { ...asset, tracks };
}
export function animationFromTracks(project: Project, objectId: string, name: string, source: AnimationAsset['source'], tracks = project.tracks): AnimationAsset {
  const kind = objectId === CAMERA_ID ? 'camera' : project.objects.find(o => o.id === objectId)?.kind;
  if (!kind) throw new Error('Select an object first.');
  return validateAnimation({ id: uid(), name: name.trim().slice(0, 120) || 'Untitled animation', kind, source, duration: project.duration,
    tracks: copyTracks(tracks.filter(track => track.objectId === objectId), objectId) });
}
export function animationFromClip(project: Project, clip: AnimationClip): AnimationAsset {
  // Preserve the source window, so saving a split never reconstructs its interpolation.
  return validateAnimation({ ...animationFromTracks({ ...project, duration: clip.sourceDuration }, clip.objectId, clip.name, clip.source, clip.tracks),
    range: { start: clip.sourceStart, end: clip.sourceEnd, duration: clip.duration }, ...(clip.web ? { web: clip.web } : {}) });
}
export function insertClip(project: Project, input: AnimationAsset, objectId: string, start: number): Project {
  const asset = validateAnimation(input), kind = objectId === CAMERA_ID ? 'camera' : project.objects.find(o => o.id === objectId)?.kind;
  if (kind !== asset.kind) throw new Error(`Select a ${asset.kind === 'humanoid' ? 'character' : asset.kind} for this animation.`);
  const at = snapTime(start, 10);
  const clip: AnimationClip = { id: uid(), name: asset.name, source: asset.source, objectId, start: at, duration: asset.range?.duration ?? asset.duration,
    sourceDuration: asset.duration, sourceStart: asset.range?.start ?? 0, sourceEnd: asset.range?.end ?? asset.duration, tracks: copyTracks(asset.tracks, objectId), ...(asset.web ? { web: asset.web } : {}) };
  const duration = Math.max(project.duration, Math.ceil(at + clip.duration));
  if (duration > 10) throw new Error('This scene supports 10 seconds. Shorten or remove a block to make room.');
  return validateProject({ ...project, duration, clips: [...project.clips ?? [], clip] });
}
export function transformClip(project: Project, id: string, start: number, duration: number): Project {
  const at = snapTime(start, project.duration), length = Math.max(1 / 30, Math.round(duration * 30) / 30);
  return validateProject({ ...project, clips: project.clips?.map(clip => clip.id === id ? { ...clip, start: at, duration: length } : clip) });
}
export function splitClip(project: Project, id: string, time: number): Project {
  const clip = project.clips?.find(value => value.id === id), at = snapTime(time, project.duration);
  if (!clip || at < clip.start + 1 / 30 - 1e-8 || at > clip.start + clip.duration - 1 / 30 + 1e-8) throw new Error('Place the playhead inside the block to split it.');
  const sourceCut = clipSourceTime(clip, at);
  const left = { ...clip, duration: at - clip.start, sourceEnd: sourceCut };
  const right = { ...clip, id: uid(), start: at, duration: clip.start + clip.duration - at, sourceStart: sourceCut, tracks: copyTracks(clip.tracks, clip.objectId) };
  return validateProject({ ...project, clips: project.clips!.flatMap(value => value.id === id ? [left, right] : [value]) });
}
