import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { toQuaternion, type SceneObject } from '../core/project';
import type { PropGeometry } from '../core/propGeometry';

export function createProp(object: Pick<SceneObject, 'id' | 'geometry' | 'dimensions'>) {
  const root = new Group(), shape = new Group();
  const parts: PropGeometry['parts'] = object.geometry?.parts ?? [{ shape: 'box', position: [0, .5, 0], size: [1, 1, 1], rotation: [0, 0, 0], color: '#cdc7bc' }];
  const meshes = parts.map(part => {
    const geometry = part.shape === 'box' ? new BoxGeometry(1, 1, 1) : part.shape === 'sphere' ? new SphereGeometry(.5, 24, 16) : new CylinderGeometry(.5, .5, 1, 24);
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: part.color, roughness: .7 }));
    mesh.position.fromArray(part.position); mesh.scale.fromArray(part.size); mesh.quaternion.copy(toQuaternion(part.rotation));
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.objectId = object.id; shape.add(mesh);
    return mesh;
  });
  // Normalize the assembled bounds once, including rotated parts, so dimensions
  // always mean the same thing as they do for existing box objects.
  const bounds = new Box3().setFromObject(shape), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  const normalized = new Group(); normalized.add(shape); root.add(normalized);
  shape.position.set(-center.x, -bounds.min.y, -center.z);
  const resize = (dimensions: SceneObject['dimensions']) => normalized.scale.set(dimensions[0] / size.x, dimensions[1] / size.y, dimensions[2] / size.z);
  resize(object.dimensions);
  return { root, meshes, signature: JSON.stringify(object.geometry), resize,
    dispose() { meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); }); },
  };
}
