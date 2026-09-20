import * as THREE from 'three';
import { CAMERA_ID, sample, toQuaternion, type Project } from '../core/project';

export const SHOT_ASPECT = 16 / 9;
export const SHOT_FOV = 38;
export const MIN_PREVIEW_SCALE = .35;

// Match the on-screen gate to the exported image, independently of panel sizes.
export function cameraFrame(width: number, height: number) {
  const padding = Math.min(16, width * .03), vertical = Math.min(44, height * .1);
  const w = Math.max(1, Math.min(width - padding * 2, (height - vertical * 2) * SHOT_ASPECT));
  const h = w / SHOT_ASPECT;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function cameraPreviewFrame(width: number, height: number, scale: number, offsetX = 0, offsetY = 0) {
  const frame = cameraFrame(width, height);
  const previewScale = Math.max(MIN_PREVIEW_SCALE, Math.min(1, scale));
  const previewWidth = frame.width * previewScale, previewHeight = frame.height * previewScale;
  const centeredX = (width - previewWidth) / 2, centeredY = (height - previewHeight) / 2;
  return {
    x: centeredX + Math.max(-centeredX, Math.min(centeredX, offsetX)),
    y: centeredY + Math.max(-centeredY, Math.min(centeredY, offsetY)),
    width: previewWidth,
    height: previewHeight,
  };
}

export function createShotCamera(scene: THREE.Scene) {
  const camera = new THREE.PerspectiveCamera(SHOT_FOV, SHOT_ASPECT, .05, 60);
  const body = new THREE.Mesh(new THREE.BoxGeometry(.26, .18, .18), new THREE.MeshBasicMaterial({ color: '#b66b40', wireframe: true }));
  body.userData.objectId = CAMERA_ID;
  const guide = new THREE.PerspectiveCamera(SHOT_FOV, SHOT_ASPECT, .12, .8);
  const helper = new THREE.CameraHelper(guide);
  const color = new THREE.Color('#b66b40');
  helper.setColors(color, color, color, color, color);
  scene.add(camera, body, helper);
  function sync(project: Project, time: number) {
    if (!project.camera) return;
    camera.position.fromArray(sample(project, 'model', 'position', time, CAMERA_ID));
    camera.quaternion.copy(toQuaternion(sample(project, 'model', 'rotation', time, CAMERA_ID)));
    camera.updateMatrixWorld(true);
  }
  function show(visible: boolean) {
    body.visible = helper.visible = visible;
    if (!visible) return;
    body.position.copy(camera.position); body.quaternion.copy(camera.quaternion);
    guide.position.copy(camera.position); guide.quaternion.copy(camera.quaternion); guide.updateMatrixWorld(true);
  }
  show(false);
  return { camera, body, helper, sync, show, dispose() { scene.remove(camera, body, helper); body.geometry.dispose(); body.material.dispose(); helper.dispose(); } };
}
