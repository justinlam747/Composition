import { Color, Float32BufferAttribute, MeshStandardMaterial, type Bone, type SkinnedMesh } from 'three';

export function createHeroAppearance(meshes: SkinnedMesh[], resolveJoint: (bone: Bone) => string | undefined) {
  const red = new Color('#b92134'), blue = new Color('#16498e');
  const blueParts = new Set(['hips', 'thigh.L', 'thigh.R', 'arm.L', 'arm.R']);
  const materials = [...new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
    .filter((material): material is MeshStandardMaterial => material instanceof MeshStandardMaterial)
    .map(material => ({ material, color: material.color.clone(), map: material.map, vertexColors: material.vertexColors }));
  const entries = meshes.map(mesh => ({ mesh, original: mesh.geometry.getAttribute('color'), hero: undefined as Float32BufferAttribute | undefined }));
  let active = false;
  return (enabled: boolean) => {
    if (active === enabled) return;
    active = enabled;
    for (const entry of entries) {
      const { mesh } = entry;
      if (enabled && !entry.hero) {
        const skin = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
        const colors = new Float32Array(skin.count * 3), color = new Color();
        for (let vertex = 0; vertex < skin.count; vertex++) {
          let blueWeight = 0;
          for (let index = 0; index < 4; index++) if (blueParts.has(resolveJoint(mesh.skeleton.bones[skin.getComponent(vertex, index)]) ?? '')) blueWeight += weights.getComponent(vertex, index);
          color.copy(red).lerp(blue, Math.min(1, blueWeight)); color.toArray(colors, vertex * 3);
        }
        entry.hero = new Float32BufferAttribute(colors, 3);
      }
      if (enabled) mesh.geometry.setAttribute('color', entry.hero!);
      else if (entry.original) mesh.geometry.setAttribute('color', entry.original);
      else mesh.geometry.deleteAttribute('color');
    }
    for (const entry of materials) {
      entry.material.color.copy(enabled ? new Color('white') : entry.color);
      entry.material.map = enabled ? null : entry.map; entry.material.vertexColors = enabled || entry.vertexColors; entry.material.needsUpdate = true;
    }
  };
}
