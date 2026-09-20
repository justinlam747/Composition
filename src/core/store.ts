import { useSyncExternalStore } from 'react';
import { type AnimationAsset, type Channel, type Project, type Vec3, type ShotCamera, CAMERA_ID, clipAt, clipSceneTime, clipSourceTime, hasTarget, primaryTarget, makeCamera, HUMANOID_ID, makeObject, validateProject, type SceneObject, type Generation, makeProject, moveKey, parseProject, sample, seedIdle, snapTime, clipTimelineTime, clipTimelineSceneTime, motionTime, motionSceneTime, uid } from './project';
import { applyProposal, sceneSignature, type Proposal } from './proposals';
import { prepareDirectorActions, type DirectorExecution } from './director';
import { simplifyRotationPath } from './rotationPath';
import { editTransformKey } from './keyEditing';
import { animationFromClip, animationFromTracks, clipPreview, clipProject, insertClip, replaceClipTracks, splitClip, transformClip } from './clips';
import { animationLibrary } from './animationLibrary';
import { loadSpiderDemo } from './spiderDemo';
import { savedSpiderAnimations } from './savedSpiderAnimations';
import { MAX_SPEED, velocityAt, velocityTime, type VelocityKey } from './velocity';
import { type Axis, type HandleSide, type Influences } from './valueGraph';

const STORAGE = 'take-one-scene-v1';
function restore(): Project | undefined { try { const raw = localStorage.getItem(STORAGE); return raw ? parseProject(raw) : undefined; } catch { return undefined; } }
export interface EditorState {
  project: Project; preview: Project | null; exporting: boolean; objectId: string; time: number; playing: boolean; loop: boolean; selected: string; channel: Channel;
  selectedKey: string | null; mode: 'translate' | 'rotate' | 'scale'; space: 'world' | 'local';
  showRig: boolean; showGrid: boolean; selectionActive: boolean; camera: 'orbit' | 'shot'; frameRequest: number;
  status: string; undoCount: number; redoCount: number;
  selectedClip: string | null; editingClip: string | null;
  phoneControl: boolean;
  directorPlacement: Vec3 | null; directorPreviewPlacement: Vec3 | null; directorPicking: boolean;
  timelineMode: 'keys' | 'velocity' | 'value'; selectedVelocityKey: string | null;
}
const draft = restore();
let hasDraft = !!draft;
const restoredProject = draft ?? makeProject();
let state: EditorState = {
  project: restoredProject, preview: null, exporting: false, objectId: primaryTarget(restoredProject), time: 0, playing: false, loop: true, selected: 'model', channel: 'position', selectedKey: null,
  mode: 'translate', space: 'world', showRig: false, showGrid: true, selectionActive: false, camera: 'orbit', frameRequest: 0,
  status: 'Ready. Start with a pose, or load the demo idle.', undoCount: 0, redoCount: 0,
  selectedClip: null, editingClip: null, phoneControl: false,
  directorPlacement: null, directorPreviewPlacement: null, directorPicking: false,
  timelineMode: 'keys', selectedVelocityKey: null,
};
const listeners = new Set<() => void>();
const past: Project[] = [], future: Project[] = [];
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let transaction: Project | null = null;
function emit(patch: Partial<EditorState>) {
  state = { ...state, ...patch };
  if (!state.preview) state.directorPreviewPlacement = null;
  if (!hasTarget(state.project, state.objectId)) {
    state = { ...state, objectId: primaryTarget(state.project), selected: 'model', channel: 'position', mode: 'translate', selectionActive: false };
  }
  if (state.camera === 'shot' && !state.project.camera) state = { ...state, camera: 'orbit' };
  for (const key of ['selectedClip', 'editingClip'] as const) if (state[key] && !state.project.clips?.some(clip => clip.id === state[key] && clip.objectId === state.objectId)) state = { ...state, [key]: null };
  listeners.forEach(fn => fn());
}
function flushPersistence() {
  clearTimeout(saveTimer);
  if (!hasDraft) return true;
  try { localStorage.setItem(STORAGE, JSON.stringify(state.project)); return true; }
  catch { emit({ status: 'Browser storage is unavailable. Use Save scene to keep your work.' }); return false; }
}
function persist() { hasDraft = true; clearTimeout(saveTimer); saveTimer = setTimeout(flushPersistence, 350); }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPersistence);
  import.meta.hot?.dispose(() => { window.removeEventListener('pagehide', flushPersistence); clearTimeout(saveTimer); });
}
function commit(project: Project, message?: string, selection?: Partial<Pick<EditorState, 'selectedKey' | 'selectedVelocityKey' | 'time'>>) {
  if (!transaction) { past.push(state.project); if (past.length > 60) past.shift(); future.length = 0; }
  emit({ project, preview: null, playing: false, selectedKey: null, selectedVelocityKey: null, undoCount: past.length, redoCount: future.length, ...(message ? { status: message } : {}), ...selection });
  persist();
}
function restoreHistory(snapshot: Project): Project {
  if (snapshot.id !== state.project.id) return snapshot;
  // Output is an external resource, not an editable scene action. Keep its request
  // reachable while undoing motion; its signature will mark the guide as stale.
  const { generation: _historicalGeneration, ...scene } = snapshot;
  return state.project.generation ? { ...scene, generation: state.project.generation } : scene;
}
function keyScope() {
  const clip = state.project.clips?.find(value => value.id === state.editingClip) ?? clipAt(state.project, state.time, state.objectId);
  if (!clip || clip.objectId !== state.objectId || state.time > clip.start + clip.duration + 1e-8) return undefined;
  return clip;
}
function poseTime(clip: ReturnType<typeof keyScope>, objectId = state.objectId, target = state.selected, channel = state.channel) {
  const selected = (clip?.tracks ?? state.project.tracks).find(track => track.objectId === objectId && track.target === target && track.channel === channel)?.keys.find(key => key.id === state.selectedKey);
  const selectedSceneTime = selected ? clip ? clipSceneTime(clip, selected.time) : motionSceneTime(state.project, selected.time, objectId) : -1;
  if (selected && Math.abs(snapTime(selectedSceneTime, state.project.duration) - state.time) < 1e-8) return { time: selected.time, selected };
  return { time: clip ? clipSourceTime(clip, state.time) : motionTime(state.project, state.time, objectId), selected: undefined };
}
function editKeys(operation: (project: Project, time: number, baseline?: Project) => Project, message?: string) {
  const clip = keyScope();
  if (!clip && state.project.clips?.some(value => value.objectId === state.objectId)) { emit({ status: 'Open an animation block to edit its keys.' }); return; }
  const { time, selected } = poseTime(clip);
  const baselineClip = transaction?.clips?.find(value => value.id === clip?.id);
  const project = operation(clip ? clipProject(state.project, clip) : { ...state.project, velocities: undefined }, time,
    transaction ? baselineClip ? clipProject(transaction, baselineClip) : { ...transaction, velocities: undefined } : undefined);
  commit(clip ? replaceClipTracks(state.project, clip.id, project.tracks) : { ...project, velocities: state.project.velocities }, message,
    selected && project.tracks.some(track => track.keys.some(key => key.id === selected.id)) ? { selectedKey: selected.id } : undefined);
}
function velocityScope() {
  const clip = state.project.clips?.find(value => value.id === state.editingClip);
  return { clip, keys: clip ? clip.velocityKeys ?? [] : state.project.velocities?.find(track => track.objectId === state.objectId)?.keys ?? [],
    time: clip ? clipTimelineTime(clip, state.time) : state.time };
}
function editVelocity(keys: VelocityKey[], selected: string | null, sceneTime = state.time) {
  if (state.exporting || !hasTarget(state.project, state.objectId)) return;
  const { clip } = velocityScope();
  const current = state.project.velocities?.find(track => track.objectId === state.objectId);
  // Once a split is edited, pin its original boundary poses while reshaping the
  // speed inside that window. Unedited splits retain their parent's exact map.
  const start = clip ? Math.max(clip.sourceStart, clip.velocityWindow?.start ?? 0) : 0;
  const end = clip ? Math.min(clip.sourceEnd, clip.velocityWindow?.end ?? clip.sourceDuration) : 0;
  const window = clip && end > start && (start !== (clip.velocityWindow?.start ?? 0) || end !== (clip.velocityWindow?.end ?? clip.sourceDuration))
    ? { start, end, from: velocityTime(clip.velocityKeys, start, clip.sourceDuration, clip.velocityWindow), to: velocityTime(clip.velocityKeys, end, clip.sourceDuration, clip.velocityWindow) } : clip?.velocityWindow;
  const project = clip ? { ...state.project, clips: state.project.clips?.map(value => value.id === clip.id ? { ...value, velocityKeys: keys, velocityWindow: window } : value) }
    : { ...state.project, velocities: [...state.project.velocities?.filter(track => track.objectId !== state.objectId) ?? [],
      ...(keys.length ? [{ objectId: state.objectId, keys, duration: Math.max(current?.duration ?? state.project.duration, ...keys.map(key => key.time)) }] : [])] };
  commit(project, undefined, { selectedVelocityKey: selected, time: snapTime(sceneTime, state.project.duration) });
}
function tryClipEdit(operation: () => Project, message: string) {
  try { commit(operation(), message); return true; }
  catch (error) { emit({ status: (error as Error).message }); return false; }
}
export const studio = {
  get: () => state,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  patch: emit,
  directorBusy: () => !!transaction || state.exporting || state.phoneControl,
  applyDirector: (execution: DirectorExecution) => {
    if (execution.status !== 'ready' || execution.proposal.status !== 'approved') throw new Error('Approve the current proposal before applying it.');
    if (studio.directorBusy()) throw new Error('Finish the current drag, capture or phone control before applying.');
    if (execution.proposal.baseSignature !== sceneSignature(state.project)) throw new Error('The scene changed. Refresh the director proposal before applying.');
    const { project, placement } = prepareDirectorActions(state.project, execution.proposal.actions, execution.animations);
    if (execution.proposal.actions.some(action => action.kind !== 'set_placement')) commit(project, 'Director changes applied. Undo is available.');
    if (placement) emit({ directorPlacement: placement, directorPicking: false, preview: null, status: 'Placement point set by Director.' });
    const created = execution.proposal.actions.find(a => a.kind === 'create_object');
    if (created?.kind === 'create_object') studio.selectObject(created.objectId);
  },
  persistNow: () => { hasDraft = true; return flushPersistence(); },
  getDraft: () => hasDraft ? state.project : undefined,
  forgetProject: (id: string) => {
    if (state.project.id !== id) return;
    studio.openProject(makeProject());
    clearTimeout(saveTimer); hasDraft = false;
    try { localStorage.removeItem(STORAGE); } catch { /* Browser storage may be disabled. The deleted project is already replaced in memory. */ }
    emit({ status: 'Project deleted.' });
  },
  openProject: (input: Project) => {
    const project = validateProject(input);
    past.length = 0; future.length = 0; transaction = null; hasDraft = true;
    emit({ project, preview: null, playing: false, time: 0, objectId: primaryTarget(project), selected: 'model',
      channel: 'position', mode: 'translate', space: 'world', selectedKey: null, selectedClip: null, editingClip: null,
      selectionActive: false, camera: 'orbit', undoCount: 0, redoCount: 0, directorPlacement: null, directorPicking: false, status: 'Project opened.' });
    emit({ timelineMode: 'keys', selectedVelocityKey: null });
    flushPersistence();
  },
  begin: () => { if (!transaction) transaction = state.project; },
  end: () => {
    if (transaction && transaction !== state.project) {
      if (state.channel === 'rotation' && state.timelineMode !== 'velocity') {
        const clip = keyScope(), tracks = clip?.tracks ?? state.project.tracks;
        const { time } = poseTime(clip);
        const track = tracks.find(t => t.objectId === state.objectId && t.target === state.selected && t.channel === 'rotation');
        const index = track?.keys.findIndex(k => Math.abs(k.time - time) < 1 / 60) ?? -1;
        if (track && index >= 0) {
          const keys = track.keys.map((key, i) => (i === index || i === index + 1) && key.rotationPath
            ? { ...key, rotationPath: simplifyRotationPath(key.rotationPath) } : key);
          const updated = tracks.map(t => t === track ? { ...t, keys } : t);
          emit({ project: clip ? replaceClipTracks(state.project, clip.id, updated) : { ...state.project, tracks: updated } });
          persist();
        }
      }
      past.push(transaction); if (past.length > 60) past.shift(); future.length = 0;
    }
    transaction = null; emit({ undoCount: past.length, redoCount: future.length });
  },
  seek: (time: number) => {
    const clip = state.project.clips?.find(value => value.id === state.editingClip);
    emit({ time: snapTime(clip ? Math.max(clip.start, Math.min(clip.start + clip.duration, time)) : time, state.project.duration), playing: false });
  },
  togglePlay: () => {
    if (state.exporting) return;
    const clip = state.project.clips?.find(value => value.id === state.editingClip), start = clip?.start ?? 0, end = clip ? clip.start + clip.duration : state.project.duration;
    emit({ playing: !state.playing, time: state.time >= end || state.time < start ? start : state.time });
  },
  tick: (delta: number) => {
    if (!state.playing || state.exporting) return;
    const clip = state.project.clips?.find(value => value.id === state.editingClip), start = clip?.start ?? 0, duration = clip?.duration ?? state.project.duration;
    const t = state.time + Math.min(delta, .1), end = start + duration;
    emit({ time: t >= end ? (state.loop ? start + (t - start) % duration : end) : t, playing: t >= end ? state.loop : true });
  },
  select: (selected: string, channel?: Channel) => emit({ selected, selectionActive: true, channel: channel ?? (selected === 'model' ? state.channel : 'rotation'),
    mode: selected === 'model' ? (channel === 'rotation' ? 'rotate' : channel === 'scale' ? 'scale' : 'translate') : 'rotate', selectedKey: null, playing: false }),
  setMode: (mode: EditorState['mode']) => {
    if (state.objectId === CAMERA_ID && mode === 'scale') return;
    emit({ mode, selectionActive: true, selected: mode !== 'rotate' ? 'model' : state.selected,
      channel: mode === 'translate' ? 'position' : mode === 'rotate' ? 'rotation' : 'scale', selectedKey: null, playing: false });
  },
  setValue: (value: Vec3, rotationPath?: Vec3[]) => {
    if (state.exporting || !hasTarget(state.project, state.objectId) || state.objectId === CAMERA_ID && state.channel === 'scale') return;
    const keyTime = snapTime(state.time, state.project.duration);
    editKeys((project, time, baseline) => editTransformKey(project, { objectId: state.objectId, target: state.selected, channel: state.channel,
      time, value, rotationPath, gestureStart: baseline }), `Key saved at ${keyTime.toFixed(2)}s. Undo is available.`);
    emit({ time: keyTime });
  },
  addKey: () => studio.setValue(sample(clipPreview(state.project, state.editingClip), state.selected, state.channel, state.time, state.objectId)),
  moveKey: (id: string, time: number) => {
    const clip = keyScope();
    const sourceTime = clip ? clipSourceTime(clip, time) : motionTime(state.project, time, state.objectId);
    editKeys(project => moveKey(project, id, sourceTime));
    emit({ selectedKey: id, time: snapTime(clip ? clipSceneTime(clip, snapTime(sourceTime, clip.sourceDuration)) : motionSceneTime(state.project, snapTime(sourceTime, state.project.duration), state.objectId), state.project.duration) });
  },
  selectValueKey: (id: string) => {
    const clip = keyScope(), tracks = clip?.tracks ?? state.project.tracks;
    const track = tracks.find(t => t.objectId === state.objectId && t.target === state.selected && t.channel === state.channel);
    const key = track?.keys.find(k => k.id === id);
    if (!key) return false;
    const time = snapTime(clip ? clipSceneTime(clip, key.time) : motionSceneTime(state.project, key.time, state.objectId), state.project.duration);
    if (state.selectedKey !== id || state.selectedVelocityKey !== null || state.playing || state.time !== time) {
      emit({ selectedKey: id, selectedVelocityKey: null, playing: false, time });
    }
    return true;
  },
  setValueHandle: (id: string, axis: Axis, side: HandleSide, influence: number) => {
    if (state.exporting || !Number.isFinite(influence) || ![0, 1, 2].includes(axis) || !['in', 'out'].includes(side)) return;
    if (!studio.selectValueKey(id)) return;
    const clamped = Math.max(.01, Math.min(1, influence));
    const existing = (keyScope()?.tracks ?? state.project.tracks).flatMap(track => track.keys).find(key => key.id === id);
    if (!existing || existing.valueHandles?.[side]?.[axis] === clamped) return;
    editKeys(project => ({ ...project, tracks: project.tracks.map(track => ({ ...track, keys: track.keys.map(key => {
      if (key.id !== id) return key;
      const values: Influences = [...key.valueHandles?.[side] ?? [null, null, null]];
      values[axis] = clamped;
      return { ...key, valueHandles: { ...key.valueHandles, [side]: values } };
    }) })) }));
  },
  resetValueHandles: (id: string, axis: Axis) => {
    if (state.exporting || ![0, 1, 2].includes(axis)) return;
    if (!studio.selectValueKey(id)) return;
    if (!(keyScope()?.tracks ?? state.project.tracks).some(track => track.keys.some(key => key.id === id))) return;
    editKeys(project => ({ ...project, tracks: project.tracks.map(track => ({ ...track, keys: track.keys.map(key => {
      if (key.id !== id) return key;
      const valueHandles = { ...key.valueHandles };
      for (const side of ['in', 'out'] as const) if (valueHandles[side]) {
        const values: Influences = [...valueHandles[side]!]; values[axis] = null;
        if (values.every(value => value === null)) delete valueHandles[side]; else valueHandles[side] = values;
      }
      const next: typeof key = { ...key, valueHandles }; if (!Object.keys(valueHandles).length) delete next.valueHandles;
      return next;
    }) })) }));
  },
  updateValueKey: (id: string, sceneTime: number, axis: Axis, value: number) => {
    if (state.exporting || ![sceneTime, value].every(Number.isFinite) || ![0, 1, 2].includes(axis)) return;
    if (!studio.selectValueKey(id)) return;
    const clip = keyScope();
    const at = snapTime(clip ? Math.max(clip.start, Math.min(clip.start + clip.duration, sceneTime)) : sceneTime, state.project.duration);
    const existing = (clip?.tracks ?? state.project.tracks).flatMap(track => track.keys).find(key => key.id === id);
    if (!existing) return;
    const existingTime = clip ? clipSceneTime(clip, existing.time) : motionSceneTime(state.project, existing.time, state.objectId);
    const original = (clip ? transaction?.clips?.find(value => value.id === clip.id)?.tracks : transaction?.tracks)?.flatMap(track => track.keys).find(key => key.id === id);
    const originalTime = original ? clip ? clipSceneTime(clip, original.time) : motionSceneTime(state.project, original.time, state.objectId) : undefined;
    const sourceTime = original && originalTime !== undefined && Math.abs(sceneTime - originalTime) < 1e-8 ? original.time
      : Math.abs(sceneTime - existingTime) < 1e-8 ? existing.time : clip ? clipSourceTime(clip, at) : motionTime(state.project, at, state.objectId);
    editKeys((project, _time, baseline) => {
      const next = moveKey(baseline ?? project, id, sourceTime);
      const track = next.tracks.find(t => t.keys.some(key => key.id === id))!, key = track.keys.find(key => key.id === id)!;
      const updated = [...key.value] as Vec3;
      updated[axis] = Math.max(track.channel === 'scale' ? .05 : -10000, Math.min(track.channel === 'scale' ? 10 : 10000, value));
      return editTransformKey(next, { objectId: track.objectId, target: track.target, channel: track.channel, time: key.time, value: updated });
    });
    const key = (keyScope()?.tracks ?? state.project.tracks).flatMap(track => track.keys).find(key => key.id === id);
    if (key) emit({ selectedKey: id, time: snapTime(clip ? clipSceneTime(clip, key.time) : motionSceneTime(state.project, key.time, state.objectId), state.project.duration) });
  },
  addVelocityKey: () => {
    const { keys, time } = velocityScope();
    const existing = keys.find(key => Math.abs(key.time - time) < 1e-8);
    if (existing) { emit({ selectedVelocityKey: existing.id }); return; }
    if (keys.length >= 1000) return;
    const key = { id: uid(), time, speed: velocityAt(keys, time) };
    editVelocity([...keys, key].sort((a, b) => a.time - b.time), key.id);
  },
  selectVelocityKey: (id: string) => {
    const { keys, clip } = velocityScope(), key = keys.find(value => value.id === id);
    if (key) emit({ selectedVelocityKey: id, selectedKey: null, playing: false,
      time: snapTime(clip ? clipTimelineSceneTime(clip, key.time) : key.time, state.project.duration) });
  },
  updateVelocityKey: (id: string, sceneTime: number, speed: number) => {
    if (!Number.isFinite(sceneTime) || !Number.isFinite(speed)) return;
    const { keys, clip } = velocityScope();
    if (!keys.some(key => key.id === id)) return;
    const baseline = clip ? transaction?.clips?.find(value => value.id === clip.id)?.velocityKeys : transaction?.velocities?.find(track => track.objectId === state.objectId)?.keys;
    const source = baseline?.some(key => key.id === id) ? baseline : keys;
    const at = snapTime(clip ? Math.max(clip.start, Math.min(clip.start + clip.duration, sceneTime)) : sceneTime, state.project.duration);
    const time = clip ? clipTimelineTime(clip, at) : at;
    const updated = source.filter(key => key.id === id || Math.abs(key.time - time) > 1e-8)
      .map(key => key.id === id ? { ...key, time, speed: Math.max(0, Math.min(MAX_SPEED, speed)) } : key).sort((a, b) => a.time - b.time);
    if (keys.length !== updated.length || keys.some((key, index) => key.id !== updated[index].id || key.time !== updated[index].time || key.speed !== updated[index].speed)) editVelocity(updated, id, at);
  },
  deleteVelocityKey: () => {
    const { keys } = velocityScope();
    if (keys.some(key => key.id === state.selectedVelocityKey)) editVelocity(keys.filter(key => key.id !== state.selectedVelocityKey), null);
  },
  deleteKey: () => {
    if (!state.selectedKey) return;
    editKeys(project => ({ ...project, tracks: project.tracks.map(t => ({ ...t, keys: t.keys.filter(k => k.id !== state.selectedKey).map(k => {
      if (t.keys[t.keys.indexOf(k) - 1]?.id !== state.selectedKey) return k;
      const updated = { ...k }; delete updated.rotationPath; return updated;
    }) })).filter(t => t.keys.length) }), 'Keyframe deleted.');
  },
  demo: () => {
    try { commit(seedIdle(state.project), 'Demo idle loaded. These are editable sample keys, not live AI output.'); emit({ time: 0, objectId: HUMANOID_ID, selected: 'chest', channel: 'rotation', mode: 'rotate', showRig: true, selectionActive: false }); }
    catch (error) { emit({ status: (error as Error).message }); }
  },
  disableDemo: () => commit({ ...state.project, demo: false }, 'Demo mode off. Your scene and keyframes are kept.'),
  clear: () => { commit({ ...state.project, tracks: [], clips: [], velocities: undefined, demo: false }, 'All motion cleared. The character is now in its static rest pose.'); emit({ time: 0 }); },
  selectClip: (id: string, edit = false) => {
    const clip = state.project.clips?.find(value => value.id === id); if (!clip) return;
    emit({ selectedClip: id, editingClip: edit ? id : null, selectedKey: null, selectedVelocityKey: null, objectId: clip.objectId, selected: 'model', channel: 'position', mode: 'translate',
      time: Math.max(clip.start, Math.min(clip.start + clip.duration, state.time)), playing: false, selectionActive: false });
  },
  addAnimation: (asset: AnimationAsset, start?: number) => {
    const objectId = asset.kind === 'humanoid' ? HUMANOID_ID : asset.kind === 'camera' ? CAMERA_ID : state.objectId;
    const at = start ?? Math.max(state.time, ...state.project.clips?.filter(clip => clip.objectId === objectId).map(clip => clip.start + clip.duration) ?? []);
    const existing = new Set(state.project.clips?.map(clip => clip.id));
    if (tryClipEdit(() => insertClip(state.project, asset, objectId, at), `${asset.name} added to the timeline.`)) {
      const clip = state.project.clips!.find(value => !existing.has(value.id))!;
      studio.selectClip(clip.id);
    }
  },
  replaceAnimation: (id: string, asset: AnimationAsset) => {
    const current = state.project.clips?.find(clip => clip.id === id);
    if (!current) throw new Error('Select an animation block first.');
    const without = { ...state.project, clips: state.project.clips?.filter(clip => clip.id !== id) };
    const project = insertClip(without, asset, current.objectId, current.start);
    const replacement = project.clips!.find(clip => clip.id !== id && clip.objectId === current.objectId && Math.abs(clip.start - current.start) < 1 / 60);
    commit(project, 'Animation regenerated. Undo is available.');
    if (replacement) studio.selectClip(replacement.id);
  },
  transformClip: (id: string, start: number, duration: number) => {
    const current = state.project.clips?.find(clip => clip.id === id);
    if (current && Math.abs(current.start - start) < 1 / 60 && Math.abs(current.duration - duration) < 1 / 60) return;
    tryClipEdit(() => transformClip(state.project, id, start, duration), 'Animation timing updated.');
  },
  splitClip: () => { if (state.selectedClip) tryClipEdit(() => splitClip(state.project, state.selectedClip!, state.time), 'Block split. Both parts keep the original motion.'); },
  deleteClip: () => { if (state.selectedClip) commit({ ...state.project, clips: state.project.clips?.filter(clip => clip.id !== state.selectedClip) }, 'Animation block deleted.'); },
  cacheAnimation: () => {
    try {
      const clip = state.project.clips?.find(value => value.id === state.selectedClip);
      animationLibrary.save(clip ? animationFromClip(state.project, clip) : animationFromTracks(state.project, state.objectId, 'Saved animation', 'edited'));
      emit({ status: 'Animation cached in this browser. Export the library for a portable backup.' });
    } catch (error) { emit({ status: (error as Error).message }); }
  },
  spiderDemo: () => {
    if (tryClipEdit(() => loadSpiderDemo(state.project, savedSpiderAnimations), 'Saved AI Spider-Man animations loaded. All three replay offline.')) {
      emit({ time: 0, objectId: HUMANOID_ID, selected: 'model', channel: 'position', mode: 'translate', selectedClip: null, editingClip: null, selectionActive: false, showRig: false });
      return true;
    }
    return false;
  },
  selectObject: (objectId: string) => { emit({ objectId, selectedVelocityKey: null }); studio.select('model', 'position'); },
  addCamera: (pose: ShotCamera = makeCamera()) => {
    if (!state.project.camera) commit(validateProject({ ...state.project, camera: pose }), 'Camera added. Move it in the scene or enter Camera view.');
    studio.selectObject(CAMERA_ID);
  },
  cameraPose: (pose: ShotCamera) => {
    if (state.exporting || state.playing || state.preview || !state.project.camera) return;
    const clip = clipAt(state.project, state.time, CAMERA_ID);
    if (clip && state.time > clip.start + clip.duration) { emit({ status: 'Open the camera block to edit its motion.' }); return; }
    let project = clip ? clipProject(state.project, clip) : { ...state.project, velocities: undefined };
    const baselineClip = transaction?.clips?.find(value => value.id === clip?.id);
    const baseline = transaction ? baselineClip ? clipProject(transaction, baselineClip) : transaction : undefined;
    const { time, selected } = poseTime(clip, CAMERA_ID, 'model');
    for (const channel of ['position', 'rotation'] as const) {
      project = editTransformKey(project, { objectId: CAMERA_ID, target: 'model', channel, time,
        value: pose[channel], gestureStart: baseline });
    }
    commit(clip ? replaceClipTracks(state.project, clip.id, project.tracks) : { ...project, velocities: state.project.velocities }, 'Camera pose saved at the playhead.', selected ? { selectedKey: selected.id } : undefined);
  },
  recordCameraTake: (asset: AnimationAsset, start: number, expectedProject: Project) => {
    if (state.project !== expectedProject) throw new Error('The scene changed during recording. The take was not applied.');
    const existing = new Set(state.project.clips?.map(clip => clip.id));
    const project = insertClip(state.project, asset, CAMERA_ID, start);
    const id = project.clips!.find(clip => !existing.has(clip.id))!.id;
    commit(project, 'Phone camera take saved. Drag its block to move or slow it down.');
    emit({ objectId: CAMERA_ID, selectedClip: id, editingClip: null, time: start, selectionActive: false });
  },
  removeObject: (objectId = state.objectId) => {
    const project = { ...state.project, objects: state.project.objects.filter(o => o.id !== objectId), tracks: state.project.tracks.filter(t => t.objectId !== objectId), clips: state.project.clips?.filter(clip => clip.objectId !== objectId), velocities: state.project.velocities?.filter(track => track.objectId !== objectId) };
    if (objectId === CAMERA_ID) delete project.camera;
    commit(project, 'Object deleted. Undo is available.');
    emit({ objectId: primaryTarget(state.project), selected: 'model', selectionActive: false });
  },
  remove: () => studio.removeObject(HUMANOID_ID),
  add: () => {
    const existing = state.project.objects.find(o => o.id === HUMANOID_ID);
    if (existing) { commit({ ...state.project, objects: state.project.objects.map(o => o.id === HUMANOID_ID ? { ...o, hidden: false } : o) }); studio.selectObject(HUMANOID_ID); }
    else studio.spawn(makeObject('humanoid'));
  },
  addBox: () => studio.spawn(makeObject('box', state.project.objects.filter(o => o.kind === 'box').length)),
  spawn: (object: SceneObject) => {
    const project = validateProject({ ...state.project, objects: [...state.project.objects, object] });
    commit(project, `${object.name} added. It starts static.`); studio.selectObject(object.id);
  },
  object: (patch: Partial<Pick<SceneObject, 'name' | 'dimensions' | 'referenceAssetIds'>>) => {
    commit(validateProject({ ...state.project, objects: state.project.objects.map(o => o.id === state.objectId ? { ...o, ...patch } : o) }), 'Object updated.');
  },
  previewProposal: (proposal: Proposal) => { const preview = applyProposal(state.project, proposal); emit({ preview, playing: false, selectionActive: false, time: 0 }); },
  applyProposal: (proposal: Proposal) => {
    const project = applyProposal(state.project, proposal);
    if (proposal.mode === 'demo') project.demo = true;
    commit(project, `${proposal.mode === 'demo' ? 'Demo' : 'AI'} suggestion applied. Undo is available.`);
    if (proposal.content.kind === 'object') studio.selectObject(project.objects.at(-1)!.id);
  },
  generation: (generation: Generation) => { hasDraft = true; emit({ project: { ...state.project, generation } }); flushPersistence(); },
  videoInstructions: (instructions: string) => {
    const generation = state.project.generation;
    if (!generation || generation.instructions === instructions) return;
    emit({ project: { ...state.project, generation: { ...generation, instructions } } });
    persist();
  },
  rename: (name: string) => commit({ ...state.project, name: name.slice(0, 120) || 'Untitled take' }),
  duration: (duration: number) => {
    const highest = Math.max(0, ...state.project.tracks.flatMap(t => t.keys.map(k => k.time)), ...state.project.clips?.map(clip => clip.start + clip.duration) ?? [], ...state.project.velocities?.flatMap(track => [track.duration ?? 0, ...track.keys.map(key => key.time)]) ?? []);
    if (duration < highest) { emit({ status: `Move or delete keys after ${duration}s before shortening the timeline.` }); return; }
    commit({ ...state.project, duration, velocities: state.project.velocities?.map(track => ({ ...track, duration: track.duration ?? state.project.duration })) }); emit({ time: Math.min(state.time, duration) });
  },
  import: (raw: string) => { const project = parseProject(raw); commit(project, 'Scene loaded.'); emit({ time: 0, objectId: primaryTarget(project), selectionActive: false, selected: 'model', channel: 'position', mode: 'translate' }); },
  undo: () => {
    const snapshot = past.pop(); if (!snapshot) return; const project = restoreHistory(snapshot);
    future.push(state.project); emit({ project, preview: null, playing: false, time: Math.min(state.time, project.duration), selectedKey: null, selectedVelocityKey: null, undoCount: past.length, redoCount: future.length, status: 'Change undone.' }); persist();
  },
  redo: () => {
    const snapshot = future.pop(); if (!snapshot) return; const project = restoreHistory(snapshot);
    past.push(state.project); emit({ project, preview: null, playing: false, time: Math.min(state.time, project.duration), selectedKey: null, selectedVelocityKey: null, undoCount: past.length, redoCount: future.length, status: 'Change restored.' }); persist();
  },
};
export function useStudio() { return useSyncExternalStore(studio.subscribe, studio.get); }
