import { useEffect, useRef, useState } from 'react';
import { createProp } from './prop';
import { registerDirectorCapture } from './directorCapture';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { MousePointer2, Move, Rotate3D, Maximize, Camera, Focus, Box, Scan, Minimize2, Maximize2 } from 'lucide-react';
import { BONES, CAMERA_ID, HUMANOID_ID, clipAt, clipSourceTime, hasCharacter, hasTarget, type Project, MAX_ROTATION_PATH_POINTS, fromQuaternion, rotationPathTo, sample, toQuaternion, unwrapRotation, type Vec3 } from '../core/project';
import { clipPreview } from '../core/clips';
import { studio, useStudio } from '../core/store';
import { refineRotationPath } from '../core/rotationPath';
import { createMannequin, type Mannequin } from './mannequin';
import { registerGuideExporter, recordCanvas } from './guideExport';
import { gizmoSizeForPart } from './gizmoSize';
import { ARExperience, initialARState } from './arExperience';
import ARControls from '../components/ARControls';
import { cameraFrame, createShotCamera } from './shotCamera';
import { changeCameraView, registerCameraNavigation } from './cameraNavigation';
import { phoneCamera } from './phoneCamera';
import { createWebLine } from './webLine';

export default function Viewport({ active = true }: { active?: boolean }) {
  const activeView = useRef(active);
  activeView.current = active;
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const xrOverlay = useRef<HTMLDivElement>(null);
  const experience = useRef<ARExperience | null>(null);
  const matchCamera = useRef<() => void>(() => {});
  const [ar, setAR] = useState(initialARState);
  const [arOpen, setAROpen] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [frameMinimized, setFrameMinimized] = useState(false);
  const state = useStudio();
  useEffect(() => {
    const container = host.current!;
    setLoading(true); setError('');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError('This browser could not start WebGL. Enable hardware acceleration and reload.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D character viewport');
    renderer.domElement.tabIndex = 0; container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#f3f2ef'); scene.fog = new THREE.Fog('#f3f2ef', 6, 18);
    const content = new THREE.Group(); scene.add(content);
    const camera = new THREE.PerspectiveCamera(38, 1, .05, 60); camera.position.set(3.1, 2.1, 5.2);
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, .95, 0); orbit.enableDamping = true; orbit.minDistance = .5; orbit.maxDistance = 16; orbit.maxPolarAngle = Math.PI * .49;
    orbit.update();
    const shot = createShotCamera(scene);
    function editorPose() { return { position: camera.position.toArray() as Vec3, rotation: fromQuaternion(camera.quaternion) }; }
    function enterCamera() {
      if (!studio.get().project.camera) studio.addCamera(editorPose());
      studio.patch({ camera: 'shot', playing: false, objectId: CAMERA_ID, selected: 'model', channel: 'position', mode: 'translate', selectionActive: false });
      renderer.domElement.focus({ preventScroll: true });
    }
    matchCamera.current = () => {
      studio.begin(); studio.addCamera(editorPose()); studio.cameraPose(editorPose()); studio.end();
      enterCamera();
    };
    scene.add(new THREE.HemisphereLight('#ffffff', '#b5b2a9', 2.1));
    const keyLight = new THREE.DirectionalLight('#fff2db', 3.4); keyLight.position.set(3, 6, 4); keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048); keyLight.shadow.camera.left = -7; keyLight.shadow.camera.right = 7; keyLight.shadow.camera.top = 7; keyLight.shadow.camera.bottom = -7; keyLight.shadow.bias = -.0004; scene.add(keyLight);
    const rim = new THREE.DirectionalLight('#b0c7ba', 2); rim.position.set(-3, 3, -3); scene.add(rim);
    const groundGeometry = new THREE.PlaneGeometry(80, 80);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: '#e6e4df', roughness: 1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.rotation.x = -Math.PI / 2; ground.position.y = -.015; ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(40, 80, '#b5b4ae', '#d1d0c9'); grid.position.y = -.009; scene.add(grid);
    const placement = new THREE.Mesh(new THREE.RingGeometry(.1, .15, 40), new THREE.MeshBasicMaterial({ color: '#9c652f', side: THREE.DoubleSide, depthTest: false }));
    placement.rotation.x = -Math.PI / 2; placement.renderOrder = 100; placement.visible = false; scene.add(placement);
    const arExperience = new ARExperience({ renderer, scene, content, camera, orbit, ground, video: video.current!, overlay: xrOverlay.current!, changed: setAR,
      modeChanged: mode => studio.patch({ camera: mode === 'idle' ? 'orbit' : mode, playing: false, selectionActive: false }),
    });
    experience.current = arExperience;
    let model: Mannequin | null = null;
    const webLine = createWebLine(content);
    const props = new Map<string, ReturnType<typeof createProp>>();
    function syncObjects(project: Project, time: number) {
      for (const [id, prop] of props) if (!project.objects.some(o => o.id === id)) { content.remove(prop.root); prop.dispose(); props.delete(id); }
      for (const object of project.objects) {
        let root: THREE.Object3D | undefined;
        if (object.kind === 'humanoid') root = model?.root;
        else {
          let prop = props.get(object.id);
          if (!prop || prop.signature !== JSON.stringify(object.geometry)) {
            if (prop) { content.remove(prop.root); prop.dispose(); }
            prop = createProp(object); content.add(prop.root); props.set(object.id, prop);
            lastSelection = ''; sizedSelection = '';
          }
          prop.resize(object.dimensions); root = prop.root;
        }
        if (!root) continue;
        root.visible = !object.hidden;
        root.position.fromArray(sample(project, 'model', 'position', time, object.id));
        root.quaternion.copy(toQuaternion(sample(project, 'model', 'rotation', time, object.id)));
        root.scale.fromArray(sample(project, 'model', 'scale', time, object.id));
        if (object.kind === 'humanoid') root.scale.multiply(new THREE.Vector3(object.dimensions[0] / .7, object.dimensions[1] / 1.9, object.dimensions[2] / .4));
      }
      if (model) {
        model.root.visible = hasCharacter(project);
        model.setHeroAppearance(project.objects.find(object => object.id === HUMANOID_ID)?.appearance === 'spider');
        for (const id of model.bones.keys()) model.setJointPose(id, sample(project, id, 'rotation', time));
      }
      webLine.update(project, time, model);
    }
    function selectedRoot() { return studio.get().objectId === CAMERA_ID ? shot.camera : studio.get().objectId === HUMANOID_ID ? model?.root : props.get(studio.get().objectId)?.root; }

    const transform = new TransformControls(camera, renderer.domElement); transform.setSize(.8); scene.add(transform.getHelper());
    const partBounds = new THREE.Box3(), partSize = new THREE.Vector3(), pivotPosition = new THREE.Vector3();
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    let sizedSelection = '', partDiameter = .3;
    let rotationPath: Vec3[] | null = null;
    let refinementBase: Vec3[] | null = null;
    let dragging = false, disposed = false, last = performance.now(), frameRequest = -1, lastSelection = '', lastMode = '', lastSpace = '', lastTime = -1, lastProject: unknown = null;
    let editSource: Project | null = null, editId: string | null = null, editView: Project | null = null;
    let viewRevision = 0;
    const unregisterNavigation = registerCameraNavigation(async view => {
      const revision = ++viewRevision;
      await arExperience.stop();
      if (disposed || revision !== viewRevision) return;
      if (view === 'shot') enterCamera();
      else {
        if (view === 'orbit' && studio.get().project.camera && camera.position.distanceTo(shot.camera.position) < 1) {
          orbit.target.copy(shot.camera.position); camera.position.copy(orbit.target).add(new THREE.Vector3(3, 1.5, 4)); orbit.update();
        }
        studio.patch({ camera: view, selectionActive: false });
      }
      setAROpen(false);
    });
    const modelReady = createMannequin().then(loaded => {
      if (disposed) { loaded.dispose(); return; }
      model = loaded; content.add(model.root); scene.add(model.helper);
      lastTime = -1; lastProject = null; frameRequest = -1;
      setLoading(false);
    }).catch(() => {
      if (!disposed) { setLoading(false); setError('The humanoid could not load. Reload to try again.'); }
    });
    transform.addEventListener('mouseDown', () => {
      dragging = true; studio.patch({ playing: false }); studio.begin();
      const s = studio.get();
      const view = clipPreview(s.project, s.editingClip), clip = clipAt(view, s.time, s.objectId);
      rotationPath = s.channel === 'rotation' ? rotationPathTo(view, s.selected, s.time, s.objectId) : null;
      const existing = (clip?.tracks ?? view.tracks).find(t => t.objectId === s.objectId && t.target === s.selected && t.channel === 'rotation')?.keys
        .some(k => Math.abs(k.time - (clip ? clipSourceTime(clip, s.time) : s.time)) < 1 / 60);
      refinementBase = existing && rotationPath && rotationPath.length > 1 ? rotationPath : null;
      if (refinementBase) rotationPath = [[...refinementBase[refinementBase.length - 1]]];
    });
    transform.addEventListener('mouseUp', () => {
      if (dragging) { dragging = false; rotationPath = null; refinementBase = null; studio.end(); lastTime = -1; lastProject = null; }
    });
    transform.addEventListener('objectChange', () => {
      if (!dragging || !transform.object) return;
      const s = studio.get(), object = transform.object;
      let value = s.channel === 'rotation' ? (s.selected === 'model' ? fromQuaternion(object.quaternion) : model!.readJointPose(s.selected)) : (s.channel === 'position' ? object.position.toArray() : object.scale.toArray()) as Vec3;
      if (s.channel === 'rotation' && rotationPath) {
        const previous = rotationPath[rotationPath.length - 1];
        const startRotation = toQuaternion(previous), endRotation = toQuaternion(value);
        const distance = startRotation.angleTo(endRotation);
        if (distance < 1e-7) return;
        const steps = Math.max(1, Math.ceil(distance / THREE.MathUtils.degToRad(10)));
        if (rotationPath.length + steps > MAX_ROTATION_PATH_POINTS) {
          if (s.selected === 'model') object.quaternion.copy(startRotation);
          else model!.setJointPose(s.selected, previous);
          studio.patch({ status: 'This rotation path is full. Add another keyframe to continue.' });
          return;
        }
        // Small consecutive samples retain the actual arc, even across full turns.
        for (let step = 1; step <= steps; step++) {
          value = unwrapRotation(fromQuaternion(startRotation.clone().slerp(endRotation, step / steps)), rotationPath[rotationPath.length - 1]);
          rotationPath.push(value);
        }
      }
      if (s.channel === 'scale' && s.objectId === HUMANOID_ID) { const dimensions = s.project.objects.find(o => o.id === HUMANOID_ID)!.dimensions; value = value.map((v, i) => v / (dimensions[i] / [.7, 1.9, .4][i])) as Vec3; }
      if (s.channel === 'scale') value.forEach((v, i) => value[i] = Math.max(.05, Math.min(10, v)));
      const route = refinementBase ? refineRotationPath(refinementBase, value) : rotationPath;
      studio.setValue(value, s.channel === 'rotation' ? route ?? undefined : undefined);
    });
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), start = new THREE.Vector2();
    let holding = false, piloting = false;
    const keys = new Set<string>();
    const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
    function moveCamera(target: THREE.Camera, dt: number) {
      const speed = dt * (keys.has('ShiftLeft') ? 4 : 1.7);
      if (keys.has('KeyW')) target.translateZ(-speed); if (keys.has('KeyS')) target.translateZ(speed);
      if (keys.has('KeyA')) target.translateX(-speed); if (keys.has('KeyD')) target.translateX(speed);
      if (keys.has('KeyQ')) target.position.y -= speed; if (keys.has('KeyE')) target.position.y += speed;
    }
    function beginPilot() {
      if (piloting) return;
      studio.begin(); piloting = true;
    }
    function endPilot() {
      if (!piloting) return;
      piloting = false; studio.end();
    }
    function savePilot() {
      studio.cameraPose({ position: shot.camera.position.toArray() as Vec3,
        rotation: unwrapRotation(fromQuaternion(shot.camera.quaternion), sample(studio.get().project, 'model', 'rotation', studio.get().time, CAMERA_ID)) });
    }
    function pointerDown(event: PointerEvent) {
      start.set(event.clientX, event.clientY);
      renderer.domElement.focus({ preventScroll: true });
      const s = studio.get();
      if (!s.phoneControl && !s.exporting && !s.playing && !s.preview && s.camera === 'shot' && event.button === 0 && !transform.axis) {
        holding = true; renderer.domElement.setPointerCapture(event.pointerId);
        if (s.camera === 'shot') beginPilot();
      }
    }
    function pointerMove(event: PointerEvent) {
      const s = studio.get();
      if (s.phoneControl || s.exporting || s.playing || s.preview || !holding || dragging || s.camera !== 'shot') return;
      const activeCamera = shot.camera;
      const look = new THREE.Euler().setFromQuaternion(activeCamera.quaternion, 'YXZ');
      look.y -= event.movementX * .004; look.x = THREE.MathUtils.clamp(look.x - event.movementY * .004, -1.5, 1.5); activeCamera.quaternion.setFromEuler(look);
      if (s.camera === 'shot') savePilot();
    }
    function pointerUp(event: PointerEvent) {
      holding = false;
      if (![...keys].some(key => movementKeys.has(key))) endPilot();
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (studio.get().exporting || ['ar', 'shot'].includes(studio.get().camera) || studio.get().preview || dragging || transform.axis || start.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); ray.setFromCamera(pointer, camera);
      if (studio.get().directorPicking) {
        const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        if (point && Math.abs(point.x) <= 20 && Math.abs(point.z) <= 20) studio.patch({ directorPlacement: [point.x, 0, point.z], directorPicking: false, status: 'Placement point set. Tell the director what belongs here.' });
        return;
      }
      const humanoidMeshes = model && hasCharacter(studio.get().project) ? (studio.get().showRig && studio.get().selectionActive ? [...model.markers.values(), ...model.meshes] : model.meshes) : [];
      const hits = ray.intersectObjects([...humanoidMeshes, ...[...props.values()].filter(p => p.root.visible).flatMap(p => p.meshes), ...(shot.body.visible ? [shot.body] : [])], false);
      if (hits[0]) {
        const propId = hits[0].object.userData.objectId;
        if (propId) studio.selectObject(propId);
        else { const id = model?.pickJoint(hits[0]); if (id) { studio.patch({ objectId: HUMANOID_ID }); studio.select(id); } }
      } else studio.patch({ selectionActive: false });
    }
    function keyDown(e: KeyboardEvent) {
      if (!activeView.current || studio.get().phoneControl || studio.get().exporting || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input,textarea,select,button,[role="dialog"]')) return;
      if (studio.get().camera === 'shot' && movementKeys.has(e.code)) {
        if (studio.get().playing || studio.get().preview) return;
        e.preventDefault(); beginPilot();
      }
      keys.add(e.code);
    }
    function keyUp(e: KeyboardEvent) { keys.delete(e.code); if (!holding && ![...keys].some(key => movementKeys.has(key))) endPilot(); }
    function blur() { keys.clear(); holding = false; endPilot(); if (dragging) { dragging = false; rotationPath = null; refinementBase = null; studio.end(); lastTime = -1; lastProject = null; } }
    function visibility() { if (document.hidden) { studio.patch({ playing: false }); blur(); } }
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointercancel', blur);
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    function resizeViewport() {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height || renderer.xr.isPresenting) return;
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
      const frame = cameraFrame(width, height);
      for (const [name, value] of Object.entries(frame)) container.style.setProperty(`--frame-${name}`, `${value}px`);
    }
    const resize = new ResizeObserver(resizeViewport); resize.observe(container);
    renderer.xr.addEventListener('sessionend', resizeViewport);
    let wasPhoneControlled = false;
    renderer.setAnimationLoop((_time, xrFrame) => {
      if (disposed) return;
      const now = performance.now(), dt = Math.min((now - last) / 1000, .1); last = now; studio.tick(dt);
      const s = studio.get();
      if (s.exporting) return;
      if (!activeView.current) { blur(); return; }
      const phoneReleased = wasPhoneControlled && !s.phoneControl;
      wasPhoneControlled = s.phoneControl;
      if (editSource !== s.project || editId !== s.editingClip) { editSource = s.project; editId = s.editingClip; editView = clipPreview(s.project, s.editingClip); }
      const project = s.preview ?? editView ?? s.project;
      const inRoom = s.camera === 'ar';
      const inShot = s.camera === 'shot';
      placement.visible = !!s.directorPlacement && !inRoom && !s.preview;
      if (s.directorPlacement) placement.position.set(s.directorPlacement[0], .005, s.directorPlacement[2]);
      if (piloting && (!inShot || s.phoneControl || s.playing || s.exporting || s.preview)) blur();
      grid.visible = s.showGrid && s.camera !== 'camera' && !inRoom;
      arExperience.updateFrame(xrFrame);
      const poseChanged = phoneReleased || s.time !== lastTime || project !== lastProject;
      if (poseChanged && !dragging) { syncObjects(project, s.time); shot.sync(project, s.time); lastTime = s.time; lastProject = project; }
      const phonePose = s.phoneControl ? phoneCamera.pose() : undefined;
      if (phonePose) { shot.camera.position.fromArray(phonePose.position); shot.camera.quaternion.fromArray(phonePose.quaternion); }
      shot.show(!!project.camera && !inShot && !inRoom && s.camera !== 'camera');
      if (model) {
        model.highlightJoint(!inRoom && !s.preview && s.selectionActive && s.objectId === HUMANOID_ID && hasCharacter(project) && !s.playing && s.selected !== 'model' ? s.selected : null);
        model.helper.visible = !inRoom && !s.preview && s.selectionActive && s.showRig && hasCharacter(project);
        model.markers.forEach((marker, id) => { marker.visible = !inRoom && !s.preview && s.selectionActive && s.showRig; marker.scale.setScalar(id === s.selected ? 1.8 : 1); });
      }
      props.forEach((prop, id) => prop.meshes.forEach(mesh => mesh.material.emissive.set(!inRoom && !s.preview && s.selectionActive && s.objectId === id && !s.playing ? '#372315' : '#000000')));
      const selection = !inRoom && !inShot && !s.preview && s.selectionActive && hasTarget(project, s.objectId) && !s.playing ? `${s.objectId}:${s.selected}` : '';
      if (selection !== lastSelection) {
        const object = s.selected === 'model' ? selectedRoot() : model?.bones.get(s.selected);
        if (selection && object) transform.attach(object); else transform.detach(); lastSelection = selection;
      }
      if (selection && transform.object) {
        if (selection !== sizedSelection || poseChanged || dragging) {
          if (s.objectId === HUMANOID_ID && model) model.getPartBounds(s.selected, partBounds).getSize(partSize);
          else if (s.objectId === CAMERA_ID) partSize.set(.5, .5, .5);
          else partBounds.setFromObject(selectedRoot()!).getSize(partSize);
          partDiameter = Math.max(partSize.x, partSize.y, partSize.z, .05);
          if (s.selected === 'model') partDiameter *= .55;
          sizedSelection = selection;
        }
        transform.object.getWorldPosition(pivotPosition);
        transform.setSize(gizmoSizeForPart(partDiameter, camera.position.distanceTo(pivotPosition), camera.fov, camera.zoom, container.clientHeight, coarsePointer));
      }
      if (s.mode !== lastMode) { transform.setMode(s.mode); lastMode = s.mode; }
      const space = s.selected === 'model' ? s.space : 'local';
      if (space !== lastSpace) { transform.setSpace(space); lastSpace = space; }
      if (!inRoom && !inShot && frameRequest !== s.frameRequest) {
        const center = (selectedRoot()?.position.clone() ?? new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0));
        camera.position.copy(center).add(new THREE.Vector3(3.1, 1.1, 5.2)); orbit.target.copy(center); camera.lookAt(center); frameRequest = s.frameRequest;
      }
      orbit.enabled = !s.exporting && !dragging && !s.directorPicking && (s.camera === 'orbit' || s.camera === 'camera');
      if (orbit.enabled) orbit.update();
      if (inShot && !s.phoneControl && !s.playing && !s.preview && [...keys].some(key => movementKeys.has(key))) {
        beginPilot();
        moveCamera(shot.camera, dt);
        savePilot();
      }
      if (inShot) {
        const width = container.clientWidth, height = container.clientHeight, frame = cameraFrame(width, height);
        renderer.setViewport(0, 0, width, height); renderer.setScissorTest(false); renderer.clear();
        renderer.setViewport(frame.x, height - frame.y - frame.height, frame.width, frame.height);
        renderer.setScissor(frame.x, height - frame.y - frame.height, frame.width, frame.height); renderer.setScissorTest(true);
        renderer.render(scene, shot.camera); renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height);
        phoneCamera.preview(renderer.domElement, frame, width);
      } else renderer.render(scene, camera);
    });
    let directorRenderer: THREE.WebGLRenderer | undefined;
    const unregisterDirector = registerDirectorCapture(() => {
      const current = studio.get();
      if (disposed || !model || dragging || current.exporting || current.phoneControl || current.camera === 'ar' || !activeView.current) throw new Error('Finish loading, dragging or capture before asking the director.');
      directorRenderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      directorRenderer.setPixelRatio(1); directorRenderer.setSize(768, 432); directorRenderer.toneMapping = renderer.toneMapping; directorRenderer.toneMappingExposure = renderer.toneMappingExposure;
      const view = (current.camera === 'shot' ? shot.camera : camera).clone(); view.aspect = 16 / 9; view.updateProjectionMatrix();
      const hidden = [grid, placement, transform.getHelper(), shot.body, shot.helper, model.helper, ...model.markers.values()];
      const visible = hidden.map(object => object.visible);
      try {
        syncObjects(current.project, current.time); hidden.forEach(object => { object.visible = false; }); model.highlightJoint(null);
        props.forEach(prop => prop.meshes.forEach(mesh => mesh.material.emissive.set(0)));
        directorRenderer.render(scene, view);
        return { image: directorRenderer.domElement.toDataURL('image/jpeg', .75), view: { position: view.position.toArray() as Vec3, rotation: fromQuaternion(view.quaternion), fov: view.fov } };
      } finally { hidden.forEach((object, index) => { object.visible = visible[index]; }); lastProject = null; }
    });
    const unregisterExport = registerGuideExporter(async () => {
      await modelReady;
      if (disposed) throw new Error('The scene was closed. Return to the editor and try again.');
      if (arExperience.state.mode !== 'idle') throw new Error('Stop camera / AR before exporting a guide. Camera frames stay local.');
      if (studio.get().phoneControl) throw new Error('Stop phone control before exporting a guide.');
      if (!model || dragging || studio.get().preview || studio.get().exporting) throw new Error('Finish loading or close the suggestion preview before exporting.');
      const snapshot = structuredClone(studio.get().project), previousTime = studio.get().time;
      const captureCamera = snapshot.camera ? shot.camera.clone() : camera.clone();
      const capture = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      capture.setPixelRatio(1); capture.setSize(1280, 720); capture.shadowMap.enabled = true; capture.shadowMap.type = renderer.shadowMap.type;
      capture.toneMapping = renderer.toneMapping; capture.toneMappingExposure = renderer.toneMappingExposure;
      const ratio = captureCamera.aspect, width = Math.min(1280, Math.round(720 * ratio)), height = Math.min(720, Math.round(1280 / ratio));
      capture.setViewport((1280 - width) / 2, (720 - height) / 2, width, height);
      studio.patch({ exporting: true, playing: false }); orbit.enabled = false; transform.detach(); lastSelection = '';
      try {
        shot.show(false);
        grid.visible = false; placement.visible = false; model.helper.visible = false; model.highlightJoint(null); model.markers.forEach(marker => marker.visible = false);
        props.forEach(prop => prop.meshes.forEach(mesh => mesh.material.emissive.set(0)));
        const blob = await recordCanvas(capture.domElement, snapshot.duration, time => {
          syncObjects(snapshot, time);
          if (snapshot.camera) {
            captureCamera.position.fromArray(sample(snapshot, 'model', 'position', time, CAMERA_ID));
            captureCamera.quaternion.copy(toQuaternion(sample(snapshot, 'model', 'rotation', time, CAMERA_ID)));
          }
          capture.render(scene, captureCamera); studio.patch({ time });
        });
        return { blob, project: snapshot };
      } finally {
        capture.dispose(); syncObjects(studio.get().project, previousTime); lastProject = null; lastTime = -1;
        studio.patch({ exporting: false, time: previousTime });
      }
    });
    return () => {
      disposed = true; blur(); unregisterNavigation(); unregisterExport(); unregisterDirector(); directorRenderer?.dispose(); placement.geometry.dispose(); placement.material.dispose(); renderer.setAnimationLoop(null); resize.disconnect(); renderer.xr.removeEventListener('sessionend', resizeViewport); shot.dispose(); webLine.dispose();
      void arExperience.dispose().finally(() => renderer.dispose()); experience.current = null;
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', blur);
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      if (dragging) studio.end(); transform.dispose(); orbit.dispose(); model?.dispose(); props.forEach(p => p.dispose()); grid.geometry.dispose();
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(m => m.dispose()); groundGeometry.dispose(); groundMaterial.dispose(); keyLight.shadow.map?.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <section className={`viewport${state.camera === 'camera' ? ' camera-active' : ''}${state.camera === 'shot' ? ' shot-active' : ''}`} aria-label="Scene editor" aria-busy={loading && !error}>
    <video ref={video} className={`camera-feed${mirrored ? ' mirrored' : ''}`} aria-label="Live camera preview" muted playsInline autoPlay hidden={ar.mode !== 'camera' || ar.phase !== 'live'} />
    <div ref={host} className="canvas-host"><div className={`shot-frame${frameMinimized ? ' is-minimized' : ''}`} hidden={state.camera !== 'shot'} aria-label="Camera frame"><span>Camera · 16:9</span></div></div>
    {state.camera === 'shot' && <button className="camera-frame-toggle icon-button" title={frameMinimized ? 'Show camera overlay' : 'Minimize camera overlay'} aria-label={frameMinimized ? 'Show camera overlay' : 'Minimize camera overlay'} aria-pressed={frameMinimized} onClick={() => setFrameMinimized(value => !value)}>{frameMinimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}</button>}
    {error && <div className="viewport-error" role="alert">{error}</div>}
    {state.directorPicking && <div className="director-placement-hint" role="status">Click the floor to place your marker <button onClick={() => studio.patch({ directorPicking: false })}>Cancel</button></div>}
    <div className="viewport-top">{state.camera !== 'shot' && <button className="frame-button icon-button" title="Frame selection (F)" aria-label="Frame character" onClick={() => studio.patch({ frameRequest: state.frameRequest + 1 })}><Focus size={19} /></button>}</div>
    {!state.preview && !state.exporting && !error && <div className="viewport-tools">
      <button title="Move model (G)" aria-label="Move model" className={state.mode === 'translate' ? 'active' : ''} onClick={() => studio.setMode('translate')}><Move size={18} /></button>
      <button title="Rotate selected joint or model (R)" aria-label="Rotate selection" className={state.mode === 'rotate' ? 'active' : ''} onClick={() => studio.setMode('rotate')}><Rotate3D size={19} /></button>
      {state.objectId !== CAMERA_ID && <button title="Scale model (S)" aria-label="Scale model" className={state.mode === 'scale' ? 'active' : ''} onClick={() => studio.setMode('scale')}><Maximize size={17} /></button>}
    </div>}
    {!state.project.objects.some(o => !o.hidden) && <div className="empty-scene"><Box size={30} /><h2>Add a character</h2><button className="button primary" onClick={studio.add}>Add sample mannequin</button></div>}
    {arOpen && state.camera !== 'ar' && <ARControls state={ar} experience={experience.current} mirrored={mirrored} onMirror={() => setMirrored(value => !value)} onClose={() => setAROpen(false)} />}
    {state.objectId === CAMERA_ID && state.selectionActive && state.camera === 'orbit' && <button className="button secondary camera-match" onClick={() => matchCamera.current()}>Set camera from this view</button>}
    <div className="viewport-bottom"><div className="camera-switch"><button title="Drag to orbit; scroll to zoom" className={state.camera === 'orbit' ? 'selected' : ''} onClick={() => changeCameraView('orbit')}><MousePointer2 size={15} /> Orbit</button><button title="Drag to aim; WASD to move; Q/E up and down. Edits key at the playhead." className={state.camera === 'shot' ? 'selected' : ''} disabled={loading || !!error || !!state.preview} onClick={() => changeCameraView('shot')}><Camera size={15} /> Camera view</button><button className={arOpen || ar.mode !== 'idle' ? 'selected' : ''} aria-expanded={arOpen} disabled={loading || !!error || !!state.preview} onClick={() => { setAROpen(open => !open); studio.patch({ selectionActive: false }); }}><Scan size={15} /> AR</button></div></div>
    {createPortal(<div ref={xrOverlay} className={`xr-overlay${state.camera === 'ar' ? ' is-active' : ''}`}>
      <div className="xr-instructions" role="status"><strong>Place your scene</strong><span>{ar.phase === 'starting' ? 'Starting room placement…' : ar.message}</span></div>
      <div className="xr-actions">
        {ar.phase === 'ready' && <button className="button primary" onClick={() => experience.current?.place()}>Place here</button>}
        {ar.phase === 'placed' && <><button className="button secondary" onClick={() => experience.current?.reposition()}>Place again</button><button className="button secondary" onClick={studio.togglePlay}>{state.playing ? 'Pause animation' : 'Play animation'}</button></>}
        <button className="button secondary" onClick={() => experience.current?.stop()}>Exit AR</button>
      </div>
    </div>, document.body)}
  </section>;
}
