import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraFeed, cameraError } from './cameraFeed';

export interface ARState {
  mode: 'idle' | 'camera' | 'ar';
  phase: 'idle' | 'starting' | 'live' | 'scanning' | 'ready' | 'placed' | 'error';
  supported: boolean | null;
  message: string;
  cameras: { id: string; label: string }[];
  deviceId: string;
}
export const initialARState: ARState = { mode: 'idle', phase: 'idle', supported: null, message: '', cameras: [], deviceId: '' };
interface Options {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; content: THREE.Group;
  camera: THREE.PerspectiveCamera; orbit: OrbitControls; ground: THREE.Mesh;
  video: HTMLVideoElement; overlay: HTMLElement;
  changed: (state: ARState) => void;
  modeChanged: (mode: ARState['mode']) => void;
}

/** Camera/room placement are transient presentation transforms; project keys remain local. */
export class ARExperience {
  state: ARState = { ...initialARState };
  private feed: CameraFeed;
  private session: XRSession | null = null;
  private hitSource: XRHitTestSource | null = null;
  private attaching: Promise<void> | null = null;
  private ending: Promise<void> | null = null;
  private revision = 0;
  private disposed = false;
  private snapshot: { camera: THREE.PerspectiveCamera; target: THREE.Vector3 } | null = null;
  private background: THREE.Scene['background'];
  private fog: THREE.Scene['fog'];
  private reticle = new THREE.Mesh(new THREE.RingGeometry(.12, .15, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));

  constructor(private o: Options) {
    this.background = o.scene.background; this.fog = o.scene.fog;
    this.reticle.matrixAutoUpdate = false; this.reticle.visible = false; o.scene.add(this.reticle);
    this.feed = new CameraFeed(o.video, () => { this.stop(); this.update({ phase: 'error', message: 'The camera disconnected. Reconnect it and retry.' }); });
    o.renderer.xr.enabled = true; o.renderer.xr.setReferenceSpaceType('local');
    o.overlay.addEventListener('beforexrselect', this.preventOverlaySelect);
    window.addEventListener('pagehide', this.pageHide);
    document.addEventListener('visibilitychange', this.visibility);
    navigator.mediaDevices?.addEventListener('devicechange', this.refreshCameras);
    if (window.isSecureContext && navigator.xr) navigator.xr.isSessionSupported('immersive-ar').then(supported => this.update({ supported })).catch(() => this.update({ supported: false }));
    else this.update({ supported: false });
  }

  private update(patch: Partial<ARState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.o.changed(this.state); } }
  private preventOverlaySelect = (event: Event) => { if ((event.target as Element).closest('.xr-actions, .xr-instructions')) event.preventDefault(); };
  private pageHide = () => this.stop();
  private visibility = () => {
    // WebXR owns its visibility lifecycle. An ordinary hidden camera tab releases the webcam.
    if (document.hidden && this.state.mode === 'camera') this.stop();
  };
  private refreshCameras = async () => {
    if (this.state.mode !== 'camera' || this.state.phase !== 'live') return;
    const revision = this.revision;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (revision === this.revision) this.update({ cameras: devices.filter(d => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })) });
    } catch { /* Camera playback still works when device enumeration is restricted. */ }
  };
  private enter(mode: 'camera' | 'ar') {
    const { camera, orbit, scene, ground } = this.o;
    if (!this.snapshot) this.snapshot = { camera: camera.clone(), target: orbit.target.clone() };
    scene.background = null; scene.fog = null; ground.visible = false;
    this.o.modeChanged(mode);
    this.update({ mode, phase: 'starting', message: '' });
  }
  private restore() {
    const { scene, content, camera, orbit, ground } = this.o;
    scene.background = this.background; scene.fog = this.fog; ground.visible = true;
    content.position.set(0, 0, 0); content.quaternion.identity(); content.scale.setScalar(1); content.visible = true;
    this.reticle.visible = false;
    if (this.snapshot) {
      // Keep the current viewport aspect if a panel or orientation changed while in AR.
      const aspect = camera.aspect;
      camera.copy(this.snapshot.camera); camera.aspect = aspect; camera.updateProjectionMatrix();
      orbit.target.copy(this.snapshot.target); this.snapshot = null;
    }
    if (!this.disposed) this.o.modeChanged('idle');
    this.update({ mode: 'idle', phase: 'idle', message: '', cameras: [], deviceId: '' });
  }

  async startCamera(deviceId?: string) {
    if (this.disposed || this.session || this.state.mode === 'ar') return;
    const revision = ++this.revision;
    this.enter('camera');
    try {
      const stream = await this.feed.start(deviceId);
      if (!stream || revision !== this.revision) return;
      this.update({ phase: 'live', deviceId: stream.getVideoTracks()[0]?.getSettings().deviceId ?? '', message: 'Camera overlay · no room tracking' });
      await this.refreshCameras();
    } catch (error) {
      if (revision !== this.revision || this.disposed) return;
      this.feed.stop(); this.restore(); this.update({ phase: 'error', message: cameraError(error) });
    }
  }

  async startRoom() {
    if (this.disposed || !this.state.supported || this.session || this.state.mode === 'ar') return;
    this.feed.stop();
    const revision = ++this.revision;
    this.enter('ar');
    this.o.content.visible = false;
    let session: XRSession | null = null;
    try {
      // This call must remain before the first await to retain the button's user activation.
      session = await navigator.xr!.requestSession('immersive-ar', { requiredFeatures: ['hit-test', 'dom-overlay'], domOverlay: { root: this.o.overlay } });
      if (revision !== this.revision || this.disposed) { await session.end(); return; }
      this.session = session;
      session.addEventListener('end', this.sessionEnded);
      session.addEventListener('select', this.place);
      session.addEventListener('visibilitychange', this.xrVisibility);
      const viewer = await session.requestReferenceSpace('viewer');
      const source = await session.requestHitTestSource?.({ space: viewer });
      if (revision !== this.revision || this.disposed) { source?.cancel(); return; }
      if (!source) throw new Error('Surface tracking is unavailable on this device. Try Camera overlay instead.');
      this.hitSource = source;
      this.attaching = this.o.renderer.xr.setSession(session);
      try { await this.attaching; } finally { this.attaching = null; }
      if (revision !== this.revision || this.disposed) { await this.endSession(session); return; }
      this.update({ phase: 'scanning', message: 'Move slowly and aim at a floor or table.' });
    } catch (error) {
      if (revision !== this.revision || this.disposed) return;
      if (session && session === this.session) {
        await this.endSession(session);
      } else this.restore();
      this.update({ phase: 'error', message: error instanceof Error && error.name === 'NotAllowedError' ? 'Room access was declined. Allow AR access and retry.' : error instanceof Error && error.name === 'NotSupportedError' ? 'This device cannot provide surface tracking with AR controls. Use Camera overlay instead.' : error instanceof Error ? error.message : 'Room placement could not start. Try Camera overlay.' });
    }
  }

  private xrVisibility = () => {
    if (this.session?.visibilityState !== 'visible') {
      this.reticle.visible = false;
      if (this.state.phase === 'ready') this.update({ phase: 'scanning', message: 'Move slowly and aim at a floor or table.' });
    }
  };
  private sessionEnded = () => {
    this.revision++;
    this.session?.removeEventListener('end', this.sessionEnded);
    this.session?.removeEventListener('select', this.place);
    this.session?.removeEventListener('visibilitychange', this.xrVisibility);
    this.session = null; this.hitSource?.cancel(); this.hitSource = null;
    this.restore();
  };

  updateFrame(frame?: XRFrame) {
    if (!frame || frame.session !== this.session || !this.hitSource || this.state.phase === 'starting') return;
    if (this.state.phase === 'placed') return;
    const reference = this.o.renderer.xr.getReferenceSpace();
    const pose = reference && frame.getHitTestResults(this.hitSource)[0]?.getPose(reference);
    // Models use Y-up meters; reject walls and ceilings so the character stays upright.
    this.reticle.visible = !!pose && pose.transform.matrix[5] > .85;
    if (this.reticle.visible && pose) this.reticle.matrix.fromArray(pose.transform.matrix);
    const phase = this.reticle.visible ? 'ready' : 'scanning';
    if (phase !== this.state.phase) this.update({ phase, message: phase === 'ready' ? 'Surface found. Tap to place the scene.' : 'Move slowly and aim at a floor or table.' });
  }
  place = () => {
    if (this.state.phase !== 'ready' || !this.reticle.visible) return;
    const { content } = this.o;
    this.reticle.matrix.decompose(content.position, content.quaternion, content.scale);
    content.visible = true; this.reticle.visible = false;
    this.update({ phase: 'placed', message: 'Scene placed at life size. Walk around it.' });
  };
  reposition = () => {
    if (this.state.phase !== 'placed') return;
    this.o.content.visible = false;
    this.update({ phase: 'scanning', message: 'Aim at a floor or table to place again.' });
  };
  private endSession(session: XRSession): Promise<void> {
    if (this.ending) return this.ending;
    // Three installs its end handler before async framebuffer/reference-space setup finishes.
    // Ending during that setup can leave its animation context and canvas half initialized.
    const attaching = this.attaching;
    this.ending = (async () => {
      if (attaching) await attaching.catch(() => {});
      if (this.session !== session) return;
      await session.end().catch(() => {});
      if (this.session === session) this.sessionEnded();
    })().finally(() => { this.ending = null; });
    return this.ending;
  }
  stop = (): Promise<void> => {
    this.revision++; this.feed.stop();
    if (this.session) return this.endSession(this.session);
    this.restore(); return Promise.resolve();
  };
  async dispose() {
    this.o.modeChanged('idle'); this.disposed = true;
    const stopped = this.stop();
    window.removeEventListener('pagehide', this.pageHide); document.removeEventListener('visibilitychange', this.visibility);
    navigator.mediaDevices?.removeEventListener('devicechange', this.refreshCameras);
    this.o.overlay.removeEventListener('beforexrselect', this.preventOverlaySelect);
    this.o.scene.remove(this.reticle); this.reticle.geometry.dispose(); this.reticle.material.dispose();
    await stopped;
  }
}
