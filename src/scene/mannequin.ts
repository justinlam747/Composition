import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { BONES, type Vec3 } from '../core/project';
import { createJointAdapter } from './rigAdapter';
import { createSelectionHighlighter } from './selectionHighlight';
import { createHeroAppearance } from './heroAppearance';

const SOURCE_BONES: Record<string, string> = {
  hips: 'DEF-hips', spine: 'DEF-spine.001', chest: 'DEF-spine.003', neck: 'DEF-neck', head: 'DEF-head',
  'arm.L': 'DEF-upper_arm.L', 'forearm.L': 'DEF-forearm.L', 'hand.L': 'DEF-hand.L',
  'arm.R': 'DEF-upper_arm.R', 'forearm.R': 'DEF-forearm.R', 'hand.R': 'DEF-hand.R',
  'thigh.L': 'DEF-thigh.L', 'shin.L': 'DEF-shin.L', 'foot.L': 'DEF-foot.L',
  'thigh.R': 'DEF-thigh.R', 'shin.R': 'DEF-shin.R', 'foot.R': 'DEF-foot.R',
};

let sourceAsset: Promise<THREE.Group> | undefined;
async function loadSourceAsset() {
  try { return await (sourceAsset ??= new GLTFLoader().loadAsync('/models/humanoid.glb').then(gltf => gltf.scene)); }
  catch (error) { sourceAsset = undefined; throw error; }
}
export async function createMannequin() {
  const asset = clone(await loadSourceAsset()) as THREE.Group;
  // SkeletonUtils creates independent bones, while geometry/material clones keep
  // per-character selection and appearance attributes isolated.
  asset.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material) ? object.material.map(material => material.clone()) : object.material.clone();
  });
  return buildMannequin(asset);
}

// Keep the original skinned geometry and full skeleton. The editor maps only its
// 17 major controls; fingers, shoulders and additional spine bones are preserved.
export function buildMannequin(asset: THREE.Group) {
  const root = new THREE.Group(); root.name = 'model'; root.add(asset);
  const meshes: THREE.SkinnedMesh[] = [];
  const sourceBones = new Map<string, THREE.Bone>();
  asset.traverse(object => {
    if (object instanceof THREE.Bone) sourceBones.set(object.name, object);
    if (object instanceof THREE.SkinnedMesh) { object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false; meshes.push(object); }
  });
  if (!meshes.length) throw new Error('The humanoid asset does not contain a skinned mesh.');
  const bones = new Map<string, THREE.Bone>();
  for (const definition of BONES) {
    const originalName = SOURCE_BONES[definition.id];
    const bone = sourceBones.get(originalName) ?? sourceBones.get(THREE.PropertyBinding.sanitizeNodeName(originalName));
    if (!bone) throw new Error(`The humanoid asset is missing ${definition.name}.`);
    bones.set(definition.id, bone);
  }
  asset.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(asset);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error('The humanoid asset has invalid bounds.');
  const normalization = 1.9 / height;
  const center = bounds.getCenter(new THREE.Vector3());
  asset.scale.multiplyScalar(normalization);
  asset.position.set(-center.x * normalization, -bounds.min.y * normalization, -center.z * normalization);
  root.updateMatrixWorld(true);
  const adapters = new Map(BONES.map(def => [def.id, createJointAdapter(bones.get(def.id)!, def.rest)]));
  const reverseBones = new Map([...bones].map(([id, bone]) => [bone, id]));
  const markers = new Map<string, THREE.Mesh>();
  const markerGeometry = new THREE.OctahedronGeometry(.02 / normalization);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: '#389576', depthTest: false });
  for (const [id, bone] of bones) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.renderOrder = 5; marker.userData.boneId = id; bone.add(marker); markers.set(id, marker);
  }
  const helper = new THREE.SkeletonHelper(root);
  const helperMaterial = helper.material as THREE.LineBasicMaterial;
  helperMaterial.color.set('#438872'); helperMaterial.depthTest = false; helperMaterial.transparent = true; helperMaterial.opacity = .55; helper.renderOrder = 4;
  function majorJoint(bone: THREE.Object3D | null): string | undefined {
    while (bone) { const id = reverseBones.get(bone as THREE.Bone); if (id) return id; bone = bone.parent; }
    return undefined;
  }
  const partVertices = new Map<string, number[][]>();
  const point = new THREE.Vector3();
  return {
    root, bones, meshes, markers, helper,
    setHeroAppearance: createHeroAppearance(meshes, majorJoint),
    highlightJoint: createSelectionHighlighter(meshes, majorJoint),
    getPartBounds(id: string, target = new THREE.Box3()) {
      let vertices = partVertices.get(id);
      if (!vertices) {
        vertices = meshes.map(mesh => {
          const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
          const selected: number[] = [];
          for (let vertex = 0; vertex < indices.count; vertex++) {
            let influence = 0;
            for (let slot = 0; slot < 4; slot++) {
              if (id === 'model' || majorJoint(mesh.skeleton.bones[indices.getComponent(vertex, slot)]) === id) influence += weights.getComponent(vertex, slot);
            }
            if (influence >= .25) selected.push(vertex);
          }
          return selected;
        });
        partVertices.set(id, vertices);
      }
      root.updateMatrixWorld(true);
      target.makeEmpty();
      meshes.forEach((mesh, index) => {
        for (const vertex of vertices[index]) target.expandByPoint(mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld));
      });
      return target;
    },
    setJointPose: (id: string, value: Vec3) => adapters.get(id)?.apply(value),
    readJointPose: (id: string): Vec3 => adapters.get(id)?.read() ?? [0, 0, 0],
    pickJoint(hit: THREE.Intersection): string | undefined {
      if (hit.object.userData.boneId) return hit.object.userData.boneId;
      const mesh = hit.object;
      if (!(mesh instanceof THREE.SkinnedMesh) || !hit.face) return undefined;
      const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
      const scores = new Map<string, number>();
      for (const vertex of [hit.face.a, hit.face.b, hit.face.c]) {
        for (let i = 0; i < 4; i++) {
          const weight = weights.getComponent(vertex, i);
          if (!weight) continue;
          const id = majorJoint(mesh.skeleton.bones[indices.getComponent(vertex, i)]);
          if (id) scores.set(id, (scores.get(id) ?? 0) + weight);
        }
      }
      return [...scores].sort((a, b) => b[1] - a[1])[0]?.[0];
    },
    dispose() {
      const geometries = new Set(meshes.map(mesh => mesh.geometry));
      const materials = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
      const skeletons = new Set(meshes.map(mesh => mesh.skeleton));
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); skeletons.forEach(skeleton => skeleton.dispose());
      markerGeometry.dispose(); markerMaterial.dispose(); helper.geometry.dispose(); helperMaterial.dispose();
    },
  };
}
export type Mannequin = ReturnType<typeof buildMannequin>;
