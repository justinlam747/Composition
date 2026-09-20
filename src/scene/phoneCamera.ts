import { useSyncExternalStore } from 'react';
import { CAMERA_ID, sample, type Project } from '../core/project';
import { phonePoseSchema, type PhoneEvent, type PhonePairing, type PhonePose } from '../core/phoneProtocol';
import { alignPhone, cameraTake, interpolateMotionSample, type MotionSample } from '../core/phoneMotion';
import { studio } from '../core/store';
import { changeCameraView } from './cameraNavigation';
import { PhonePreview, initialPreviewState, type PreviewState } from './phonePreview';

interface State {
  pairing: PhonePairing | null; connected: boolean; tracking: 'waiting' | PhonePose['tracking'];
  aligned: boolean; recording: boolean; elapsed: number; message: string;
  preview: PreviewState;
}
let state: State = { pairing: null, connected: false, tracking: 'waiting', aligned: false, recording: false, elapsed: 0, message: '', preview: initialPreviewState };
const listeners = new Set<() => void>();
let events: EventSource | undefined, watch: ReturnType<typeof setInterval> | undefined;
let latest: PhonePose | undefined, receivedAt = 0, revision = 0;
let mapPose: ReturnType<typeof alignPhone> | undefined, live: MotionSample | undefined;
let take: { project: Project; start: number; limit: number; samples: MotionSample[] } | undefined;
const preview = typeof document === 'undefined' ? undefined : new PhonePreview(value => update({ preview: value }));
function update(patch: Partial<State>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
function sendState() {
  if (state.pairing) void fetch(`/api/phone/${state.pairing.id}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aligned: state.aligned, recording: state.recording }), signal: AbortSignal.timeout(2000) }).catch(() => {});
}
function stopTake(message = 'Take saved. Open Animate to replay and adjust it.') {
  const finished = take; take = undefined;
  if (finished) {
    try { studio.recordCameraTake(cameraTake(finished.samples), finished.start, finished.project); studio.persistNow(); }
    catch (error) { message = (error as Error).message; }
  }
  mapPose = undefined; live = undefined;
  studio.patch({ phoneControl: false, playing: false });
  update({ aligned: false, recording: false, message }); sendState();
}
function loseTracking(message: string) {
  latest = undefined;
  stopTake(message);
  update({ tracking: 'waiting' });
}
function receive(event: PhoneEvent) {
  if (event.type === 'ended') { phoneCamera.disconnect(); return; }
  if (event.type === 'connection') {
    if (event.connected && !state.connected && state.pairing) preview?.connect(state.pairing.id);
    update({ connected: event.connected });
    if (!event.connected) { preview?.disconnect(); loseTracking('Phone disconnected. Any captured motion was saved; reconnect and set the starting pose again.'); }
    return;
  }
  if (event.type === 'preview-ready') { preview?.receiverReady(); return; }
  if (event.type === 'signal') { preview?.signal(event); return; }
  if (event.type === 'pulse') { preview?.pulse(event.streamId, event.id); return; }
  if (event.type === 'diagnostics') { preview?.diagnostics(event); return; }
  if (event.type === 'control') {
    if (event.action === 'align') void phoneCamera.align();
    if (event.action === 'record') phoneCamera.record();
    if (event.action === 'stop') stopTake();
    return;
  }
  const parsed = phonePoseSchema.safeParse(event); if (!parsed.success) return;
  const pose = parsed.data;
  if (latest && (pose.seq <= latest.seq || pose.time <= latest.time)) return;
  if (latest && pose.time - latest.time > .35 && state.aligned) loseTracking('Tracking paused. The captured portion was saved. Set the starting pose again.');
  latest = pose; receivedAt = performance.now();
  preview?.poseReceived();
  if (state.tracking !== pose.tracking) update({ tracking: pose.tracking });
  if (pose.tracking !== 'normal') {
    if (state.aligned) stopTake('Tracking is limited. The captured portion was saved. Move slowly, then set the starting pose again.');
    return;
  }
  if (!mapPose) return;
  live = mapPose(pose);
  if (!take) return;
  const elapsed = live.time - take.samples[0].time;
  take.samples.push(live);
  studio.patch({ time: take.start + Math.min(elapsed, take.limit) });
  if (Math.floor(elapsed * 10) !== Math.floor(state.elapsed * 10)) update({ elapsed: Math.min(elapsed, take.limit) });
  if (elapsed >= take.limit) {
    // Keep the last observed span for interpolation, but end at the available scene time.
    const a = take.samples.at(-2)!, b = take.samples.at(-1)!;
    const end = take.samples[0].time + take.limit;
    if (b.time > end) {
      take.samples[take.samples.length - 1] = interpolateMotionSample(a, b, end);
    }
    stopTake();
  }
}
export const phoneCamera = {
  get: () => state,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  pose: () => live,
  async pair() {
    phoneCamera.disconnect(); const current = ++revision;
    update({ message: 'Opening phone connection…' });
    try {
      const response = await fetch('/api/phone/session', { method: 'POST', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('The phone bridge is unavailable. See the phone setup guide.');
      const pairing: PhonePairing = await response.json();
      if (current !== revision) { void fetch(`/api/phone/${pairing.id}`, { method: 'DELETE' }); return; }
      update({ pairing, message: 'Enter this computer address and pairing code in the iPhone companion.' });
      events = new EventSource(`/api/phone/${pairing.id}/events`);
      events.onmessage = event => { if (current === revision) { try { receive(JSON.parse(event.data)); } catch { loseTracking('Invalid tracking data. Pair again.'); } } };
      events.onerror = () => { if (current === revision) { phoneCamera.disconnect(); update({ message: 'Connection ended. Pair the phone again.' }); } };
      watch = setInterval(() => {
        if (latest && performance.now() - receivedAt > 500) loseTracking('No fresh tracking data. Any captured motion was saved. Set the starting pose after tracking returns.');
      }, 100);
    } catch (error) { if (current === revision) update({ message: (error as Error).message }); }
  },
  async align() {
    if (document.hidden || studio.get().exporting || studio.get().preview || take || !latest || latest.tracking !== 'normal' || performance.now() - receivedAt > 500) return;
    const current = revision;
    await changeCameraView('shot');
    if (document.hidden || current !== revision || !latest || latest.tracking !== 'normal' || performance.now() - receivedAt > 500) return;
    const s = studio.get(); if (s.exporting || s.preview || !s.project.camera) return;
    mapPose = alignPhone(latest, { position: sample(s.project, 'model', 'position', s.time, CAMERA_ID), rotation: sample(s.project, 'model', 'rotation', s.time, CAMERA_ID) });
    live = mapPose(latest);
    studio.patch({ phoneControl: true, editingClip: null, playing: false, selectionActive: false });
    update({ aligned: true, elapsed: 0, message: 'Move the phone to frame your shot. Record when ready.' }); sendState();
  },
  record() {
    if (document.hidden || !state.aligned || !live || take || !latest || latest.tracking !== 'normal' || performance.now() - receivedAt > 500) return;
    const s = studio.get(), start = Math.round(s.time * 30) / 30;
    const clips = s.project.clips?.filter(clip => clip.objectId === CAMERA_ID) ?? [];
    if (clips.some(clip => start >= clip.start && start < clip.start + clip.duration)) { update({ message: 'Move the playhead to an empty part of the camera track before recording.' }); return; }
    const end = Math.min(s.project.duration, ...clips.filter(clip => clip.start > start).map(clip => clip.start));
    if (end - start < 1 / 30) { update({ message: 'Move the playhead earlier to leave room for a take.' }); return; }
    take = { project: s.project, start, limit: end - start, samples: [live] };
    update({ recording: true, elapsed: 0, message: 'Recording your camera movement…' }); sendState();
  },
  stop: () => stopTake(take ? undefined : 'Phone control paused. Saved camera motion is unchanged.'),
  disconnect() {
    preview?.disconnect();
    revision++; events?.close(); events = undefined; clearInterval(watch); watch = undefined;
    const id = state.pairing?.id;
    stopTake(take ? undefined : 'Phone disconnected.'); latest = undefined;
    update({ pairing: null, connected: false, tracking: 'waiting' });
    if (id) void fetch(`/api/phone/${id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
  },
  preview(canvas: HTMLCanvasElement, frame: { x: number; y: number; width: number; height: number }, cssWidth: number) {
    if (state.connected) preview?.frame(canvas, frame, cssWidth, !!live);
  },
  configurePreview: (mode: PreviewState['mode'], fps: 30 | 60 = 60) => preview?.configure(mode, fps),
};
const hide = () => { if (document.hidden) stopTake('Phone control paused because the editor was hidden. Set the starting pose again.'); };
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', phoneCamera.disconnect);
  import.meta.hot?.dispose(() => { phoneCamera.disconnect(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', phoneCamera.disconnect); });
}
export function usePhoneCamera() { return useSyncExternalStore(phoneCamera.subscribe, phoneCamera.get); }
