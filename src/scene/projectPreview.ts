import * as THREE from 'three';
import { createProp } from './prop';
import type { ProjectPreview } from '../core/projectPreview';
import { toQuaternion } from '../core/project';
import { createMannequin, type Mannequin } from './mannequin';
import { SHOT_ASPECT, SHOT_FOV } from './shotCamera';
import { createWebLine } from './webLine';

function createPreviewRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(640, 360); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f3f2ef');
  const content = new THREE.Group(); scene.add(content);
  const webContent = new THREE.Group(); scene.add(webContent);
  const webLine = createWebLine(webContent);
  const camera = new THREE.PerspectiveCamera(SHOT_FOV, SHOT_ASPECT, .05, 500);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b5b2a9', 2.1));
  const light = new THREE.DirectionalLight('#fff2db', 3.4); light.position.set(3, 6, 4); light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = light.shadow.camera.bottom = -12;
  light.shadow.camera.right = light.shadow.camera.top = 12; light.shadow.bias = -.0004; scene.add(light);
  const rim = new THREE.DirectionalLight('#b0c7ba', 2); rim.position.set(-3, 3, -3); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#e6e4df', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.015; ground.receiveShadow = true; scene.add(ground);
  let props: ReturnType<typeof createProp>[] = [];
  let mannequin: Mannequin | undefined;

  return {
    async capture(preview: ProjectPreview) {
      props.forEach(prop => prop.dispose()); props = [];
      content.clear();
      const hasHumanoid = preview.objects.some(object => object.kind === 'humanoid');
      if (hasHumanoid && !mannequin) {
        mannequin = await createMannequin();
        mannequin.markers.forEach(marker => { marker.visible = false; });
      }
      for (const object of preview.objects) {
        const prop = object.kind === 'box' ? createProp(object) : undefined;
        const root = prop ? prop.root : mannequin!.root;
        if (object.kind === 'box') {
          props.push(prop!);
        } else {
          mannequin!.setHeroAppearance(object.appearance === 'spider');
          for (const [id, rotation] of Object.entries(preview.pose)) mannequin!.setJointPose(id, rotation);
        }
        root.position.fromArray(object.position); root.quaternion.copy(toQuaternion(object.rotation)); root.scale.fromArray(object.scale);
        if (object.kind === 'humanoid') root.scale.multiply(new THREE.Vector3(object.dimensions[0] / .7, object.dimensions[1] / 1.9, object.dimensions[2] / .4));
        content.add(root);
      }
      content.updateMatrixWorld(true);
      webLine.show(preview.web ?? null, mannequin ?? null);
      camera.far = 500;
      if (preview.camera) {
        camera.position.fromArray(preview.camera.position); camera.quaternion.copy(toQuaternion(preview.camera.rotation));
      } else {
        if (hasHumanoid) mannequin?.meshes.forEach(mesh => mesh.computeBoundingBox());
        const bounds = new THREE.Box3().setFromObject(content);
        if (preview.web) bounds.union(new THREE.Box3().setFromObject(webContent));
        const center = bounds.isEmpty() ? new THREE.Vector3(0, .95, 0) : bounds.getCenter(new THREE.Vector3());
        const radius = bounds.isEmpty() ? 1.2 : Math.max(1.2, bounds.getBoundingSphere(new THREE.Sphere()).radius);
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(SHOT_FOV / 2)) * 1.12;
        camera.position.copy(center).add(new THREE.Vector3(3.1, 1.7, 5.2).normalize().multiplyScalar(distance));
        camera.lookAt(center);
        camera.far = Math.max(500, distance + radius * 2);
      }
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/jpeg', .85);
    },
    dispose() {
      mannequin?.dispose(); webLine.dispose(); props.forEach(prop => prop.dispose()); ground.geometry.dispose(); ground.material.dispose();
      light.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}

// Cards share one short-lived renderer; cached images never keep WebGL contexts alive.
let worker: ReturnType<typeof createPreviewRenderer> | undefined;
let queue = Promise.resolve();
let idle: ReturnType<typeof setTimeout> | undefined;
const images = new Map<string, string>();
export function renderProjectPreview(key: string, preview: ProjectPreview, signal: AbortSignal): Promise<string | null> {
  const cached = images.get(key);
  if (cached) return Promise.resolve(cached);
  const result = queue.then(async () => {
    if (signal.aborted) return null;
    const ready = images.get(key);
    if (ready) return ready;
    clearTimeout(idle);
    try {
      worker ??= createPreviewRenderer();
      const image = await worker.capture(preview);
      images.set(key, image);
      if (images.size > 48) images.delete(images.keys().next().value!);
      return signal.aborted ? null : image;
    } finally {
      idle = setTimeout(() => { worker?.dispose(); worker = undefined; }, 500);
    }
  });
  queue = result.then(() => {}, () => {});
  return result;
}
