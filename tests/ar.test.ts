import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WebXRManager } from 'three/src/renderers/webxr/WebXRManager.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARExperience } from '../src/scene/arExperience';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const source = { cancel: vi.fn() };
  const session = Object.assign(new EventTarget(), {
    requestReferenceSpace: vi.fn().mockResolvedValue({}),
    requestHitTestSource: vi.fn().mockResolvedValue(source),
    end: vi.fn(async () => { session.dispatchEvent(new Event('end')); }),
  });
  const requestSession = vi.fn().mockResolvedValue(session);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { isSecureContext: true }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('navigator', { xr: { isSessionSupported: vi.fn().mockResolvedValue(true), requestSession } });
  const scene = new THREE.Scene(), content = new THREE.Group(), camera = new THREE.PerspectiveCamera(38, 1.5), ground = new THREE.Mesh();
  camera.position.set(3, 2, 5); scene.add(content, ground); scene.background = new THREE.Color('white');
  const orbit = { target: new THREE.Vector3(0, 1, 0) } as OrbitControls;
  const xr = { enabled: false, setReferenceSpaceType: vi.fn(), setSession: vi.fn().mockResolvedValue(undefined), getReferenceSpace: vi.fn().mockReturnValue({}) };
  const experience = new ARExperience({ scene, content, camera, ground, orbit,
    renderer: { xr } as unknown as THREE.WebGLRenderer,
    video: { pause: vi.fn(), srcObject: null } as unknown as HTMLVideoElement,
    overlay: new EventTarget() as HTMLElement, changed: vi.fn(), modeChanged: vi.fn(),
  });
  return { experience, source, session, requestSession, scene, content, camera, xr };
}
function frame(session: unknown, matrix?: THREE.Matrix4) {
  return { session, getHitTestResults: () => matrix ? [{ getPose: () => ({ transform: { matrix: matrix.elements } }) }] : [] } as unknown as XRFrame;
}

it('places the entire animated scene on a horizontal surface and restores editor coordinates on exit', async () => {
  const { experience: ar, session, requestSession, content, scene, camera, source } = setup();
  const object = new THREE.Object3D(); object.position.set(1, 0, 2); content.add(object);
  await Promise.resolve(); await ar.startRoom();
  expect(requestSession).toHaveBeenCalledWith('immersive-ar', expect.objectContaining({ requiredFeatures: ['hit-test', 'dom-overlay'] }));
  expect(ar.state.phase).toBe('scanning'); expect(scene.background).toBeNull(); expect(content.visible).toBe(false);
  ar.updateFrame(frame(session, new THREE.Matrix4().makeTranslation(4, .8, -3)));
  expect(ar.state.phase).toBe('ready'); session.dispatchEvent(new Event('select'));
  expect(ar.state.phase).toBe('placed'); expect(content.visible).toBe(true);
  expect(object.position.toArray()).toEqual([1, 0, 2]);
  expect(object.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([5, .8, -1]);
  object.position.x = 2; // Animation sampling remains local to the placement group.
  expect(object.getWorldPosition(new THREE.Vector3()).x).toBe(6);
  camera.position.set(0, 1.7, 0);
  ar.stop();
  expect(source.cancel).toHaveBeenCalledOnce(); expect(ar.state.mode).toBe('idle');
  expect(content.position.toArray()).toEqual([0, 0, 0]); expect(object.position.x).toBe(2);
  expect(camera.position.toArray()).toEqual([3, 2, 5]); expect(scene.background).not.toBeNull(); ar.dispose();
});

it('rejects walls and lost hits, then requires a new surface after repositioning', async () => {
  const { experience: ar, session, content } = setup(); await Promise.resolve(); await ar.startRoom();
  ar.updateFrame(frame(session, new THREE.Matrix4().makeRotationX(Math.PI / 2))); ar.place();
  expect(ar.state.phase).toBe('scanning'); expect(content.visible).toBe(false);
  ar.updateFrame(frame(session, new THREE.Matrix4())); expect(ar.state.phase).toBe('ready');
  ar.updateFrame(frame(session)); ar.place(); expect(ar.state.phase).toBe('scanning');
  ar.updateFrame(frame(session, new THREE.Matrix4())); ar.place(); ar.reposition();
  expect(content.visible).toBe(false); ar.place(); expect(ar.state.phase).toBe('scanning'); ar.dispose();
});

it('ends a room session granted after cancellation without attaching it to the renderer', async () => {
  const { experience: ar, requestSession, session, xr } = setup();
  let resolve!: (value: unknown) => void;
  requestSession.mockReturnValue(new Promise(r => { resolve = r; }));
  await Promise.resolve(); const pending = ar.startRoom(); ar.stop(); resolve(session); await pending;
  expect(session.end).toHaveBeenCalledOnce(); expect(xr.setSession).not.toHaveBeenCalled(); expect(ar.state.mode).toBe('idle'); ar.dispose();
});

it('recovers the editor if surface tracking or renderer initialization fails', async () => {
  const { experience: ar, session, content, xr } = setup(); await Promise.resolve();
  session.requestHitTestSource.mockRejectedValueOnce(new Error('Surface tracking unavailable'));
  await ar.startRoom(); expect(ar.state.phase).toBe('error'); expect(content.visible).toBe(true);
  xr.setSession.mockRejectedValueOnce(new Error('XR initialization failed'));
  await ar.startRoom(); expect(ar.state.phase).toBe('error'); expect(ar.state.mode).toBe('idle');
  expect(ar.state.message).toContain('XR initialization failed'); ar.dispose();
});

it('waits for renderer initialization before ending a canceled session', async () => {
  const { experience: ar, session, xr } = setup();
  let finish!: () => void;
  xr.setSession.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  await Promise.resolve(); const starting = ar.startRoom();
  await vi.waitFor(() => expect(xr.setSession).toHaveBeenCalledOnce());
  const stopping = ar.stop();
  expect(session.end).not.toHaveBeenCalled();
  finish(); await Promise.all([starting, stopping]);
  expect(session.end).toHaveBeenCalledOnce(); expect(ar.state.mode).toBe('idle'); await ar.dispose();
});

it('explains unsupported AR controls without leaving an invisible scene', async () => {
  const { experience: ar, requestSession, content } = setup();
  requestSession.mockRejectedValue(new DOMException('Unsupported feature', 'NotSupportedError'));
  await Promise.resolve(); await ar.startRoom();
  expect(ar.state.mode).toBe('idle'); expect(ar.state.message).toContain('Use Camera overlay'); expect(content.visible).toBe(true); await ar.dispose();
});

it.each([
  ['app', 'framebuffer'], ['browser', 'framebuffer'], ['browser', 'compatibility'],
])('restores the real Three renderer after %s interruption during %s setup', async (source, stage) => {
  const { experience: ar, session, xr } = setup();
  let resolveLocal!: (space: XRReferenceSpace) => void;
  const local = new Promise<XRReferenceSpace>(resolve => { resolveLocal = resolve; });
  const dimensions = { width: 900, height: 600, ratio: 2 };
  vi.stubGlobal('XRWebGLLayer', class { framebufferWidth = 1500; framebufferHeight = 900; fixedFoveation = 0; });
  const renderer = {
    getRenderTarget: () => null, setRenderTarget: vi.fn(),
    getPixelRatio: () => dimensions.ratio, setPixelRatio: (ratio: number) => { dimensions.ratio = ratio; },
    getSize: (target: THREE.Vector2) => target.set(dimensions.width, dimensions.height),
    setSize: (width: number, height: number) => { dimensions.width = width; dimensions.height = height; },
  } as unknown as THREE.WebGLRenderer;
  const manager = new WebXRManager(renderer, { getContextAttributes: () => ({ xrCompatible: stage !== 'compatibility' }), makeXRCompatible: () => local } as unknown as WebGLRenderingContext);
  manager.setReferenceSpaceType('local');
  xr.setSession.mockImplementation((value: XRSession) => manager.setSession(value));
  session.requestReferenceSpace.mockImplementation((type: string) => type === 'viewer' ? Promise.resolve({}) : local);
  Object.assign(session, { updateRenderState: vi.fn(), requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn() });
  await Promise.resolve(); const starting = ar.startRoom();
  await vi.waitFor(() => expect(xr.setSession).toHaveBeenCalledOnce());
  expect(dimensions.width).toBe(stage === 'compatibility' ? 900 : 1500);
  const stopping = source === 'app' ? ar.stop() : Promise.resolve(session.dispatchEvent(new Event('end')));
  expect(session.end).not.toHaveBeenCalled();
  resolveLocal({} as XRReferenceSpace); await Promise.all([starting, stopping]);
  expect(session.end).toHaveBeenCalledTimes(source === 'app' ? 1 : 0);
  expect(dimensions).toEqual({ width: 900, height: 600, ratio: 2 }); expect(ar.state.mode).toBe('idle'); await ar.dispose();
});
