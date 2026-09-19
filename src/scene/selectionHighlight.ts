import { Color, Float32BufferAttribute, MeshStandardMaterial, type Bone, type SkinnedMesh } from 'three';

// Tint only vertices influenced by the selected editor joint. The original
// skinned mesh, lighting and materials are retained; no overlay mesh is needed.
export function createSelectionHighlighter(meshes: SkinnedMesh[], resolveJoint: (bone: Bone) => string | undefined) {
  const color = new Color('#f6a05c');
  const materials = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  for (const material of materials) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.onBeforeCompile = shader => {
      shader.uniforms.compositionHighlightColor = { value: color };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float compositionPartWeight;\nvarying float vCompositionPartWeight;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCompositionPartWeight = compositionPartWeight;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 compositionHighlightColor;\nvarying float vCompositionPartWeight;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat compositionSelection = smoothstep(0.08, 0.55, vCompositionPartWeight);\ndiffuseColor.rgb = mix(diffuseColor.rgb, compositionHighlightColor, compositionSelection * 0.78);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += compositionHighlightColor * compositionSelection * 0.12;');
    };
    material.customProgramCacheKey = () => 'composition-part-highlight-v1';
    material.needsUpdate = true;
  }
  const entries = meshes.map(mesh => {
    const attribute = new Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count), 1);
    mesh.geometry.setAttribute('compositionPartWeight', attribute);
    return { mesh, attribute, cached: new Map<string, Float32Array>() };
  });
  let previous: string | null = null;
  return (joint: string | null) => {
    if (joint === previous) return;
    previous = joint;
    for (const { mesh, attribute, cached } of entries) {
      if (!joint) attribute.array.fill(0);
      else {
        let selected = cached.get(joint);
        if (!selected) {
          selected = new Float32Array(attribute.count);
          const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
          for (let vertex = 0; vertex < attribute.count; vertex++) {
            for (let influence = 0; influence < 4; influence++) {
              const weight = weights.getComponent(vertex, influence);
              if (weight > 0 && resolveJoint(mesh.skeleton.bones[indices.getComponent(vertex, influence)]) === joint) selected[vertex] += weight;
            }
            selected[vertex] = Math.min(1, selected[vertex]);
          }
          cached.set(joint, selected);
        }
        attribute.copyArray(selected);
      }
      attribute.needsUpdate = true;
    }
  };
}
