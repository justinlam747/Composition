import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Bone, Box3, Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BONES, defaultValue, makeProject, sample, toQuaternion } from '../src/core/project';
import { loadSpiderDemo } from '../src/core/spiderDemo';
import { savedSpiderAnimations } from '../src/core/savedSpiderAnimations';
import { createJointAdapter } from '../src/scene/rigAdapter';
import { buildMannequin } from '../src/scene/mannequin';
import { gizmoSizeForPart } from '../src/scene/gizmoSize';

describe('imported humanoid', () => {
  it('plays saved Hunyuan motion on the real rig with continuous transitions and ground contact', async () => {
    const bytes = await readFile('public/models/humanoid.glb');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = buildMannequin(gltf.scene), project = loadSpiderDemo(makeProject(), savedSpiderAnimations);
    expect(project.clips!.every(clip => clip.source === 'ai')).toBe(true);
    const rootAt = (time: number) => {
      model.root.position.fromArray(sample(project, 'model', 'position', time));
      for (const id of model.bones.keys()) model.setJointPose(id, sample(project, id, 'rotation', time));
      return model.getPartBounds('model');
    };
    try {
      for (let frame = 0; frame <= 540; frame++) expect(rootAt(frame / 60).min.y).toBeGreaterThan(-.012);
      for (const time of [1.9, 3, 9]) expect(rootAt(time).min.y).toBeCloseTo(.003, 2);
      for (const time of [2, 3.5]) {
        rootAt(time - 1e-6);
        const before = [...model.bones.values()].map(bone => bone.getWorldPosition(new Vector3()));
        rootAt(time);
        [...model.bones.values()].forEach((bone, index) => expect(bone.getWorldPosition(new Vector3()).distanceTo(before[index])).toBeLessThan(.005));
      }
      expect(rootAt(0).min.y).toBeGreaterThan(3);
      expect(rootAt(5).min.y).toBeGreaterThan(1);
    } finally { model.dispose(); }
  });
  it('keeps the prepared landing motions above the floor on the actual skinned rig', async () => {
    const bytes = await readFile('public/models/humanoid.glb');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = buildMannequin(gltf.scene), project = loadSpiderDemo(makeProject());
    try {
      for (let frame = 0; frame <= 300; frame++) {
        const time = frame / 30;
        model.root.position.fromArray(sample(project, 'model', 'position', time));
        model.root.quaternion.copy(toQuaternion(sample(project, 'model', 'rotation', time)));
        for (const id of model.bones.keys()) model.setJointPose(id, sample(project, id, 'rotation', time));
        expect(model.getPartBounds('model').min.y).toBeGreaterThan(-.01);
      }
    } finally { model.dispose(); }
  });
  it('preserves the skinned asset and maps the existing editor controls', async () => {
    const bytes = await readFile('public/models/humanoid.glb');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    expect(gltf.animations).toHaveLength(0);
    const model = buildMannequin(gltf.scene);
    expect(model.bones.size).toBe(BONES.length);
    expect(model.meshes.length).toBeGreaterThan(0);
    expect(model.meshes[0].skeleton.bones.length).toBeGreaterThan(BONES.length);
    model.highlightJoint('head');
    const selectedHead = model.meshes.map(mesh => Array.from(mesh.geometry.getAttribute('compositionPartWeight').array));
    const highlightedVertices = selectedHead.flat().filter(weight => weight > .5).length;
    expect(highlightedVertices).toBeGreaterThan(0);
    expect(highlightedVertices).toBeLessThan(selectedHead.flat().length / 2);
    model.highlightJoint('hand.L');
    const selectedHand = model.meshes.flatMap(mesh => Array.from(mesh.geometry.getAttribute('compositionPartWeight').array));
    expect(selectedHand.some(weight => weight > .5)).toBe(true);
    expect(selectedHand).not.toEqual(selectedHead.flat());
    model.highlightJoint(null);
    expect(model.meshes.every(mesh => Array.from(mesh.geometry.getAttribute('compositionPartWeight').array).every(weight => weight === 0))).toBe(true);
    model.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model.root);
    expect(bounds.min.y).toBeCloseTo(0, 2);
    expect(bounds.max.y).toBeCloseTo(1.9, 2);
    const headSize = model.getPartBounds('head').getSize(new Vector3());
    const chestSize = model.getPartBounds('chest').getSize(new Vector3());
    expect(Math.max(headSize.x, headSize.y, headSize.z)).toBeLessThan(Math.max(chestSize.x, chestSize.y, chestSize.z));
    model.root.scale.setScalar(2);
    const scaledHead = model.getPartBounds('head').getSize(new Vector3());
    expect(scaledHead.y).toBeCloseTo(headSize.y * 2, 4);
    model.root.scale.setScalar(1); model.root.updateMatrixWorld(true);
    const hand = model.bones.get('hand.L')!;
    const start = hand.getWorldPosition(new Vector3());
    const original = model.bones.get('forearm.L')!.quaternion.clone().normalize();
    model.setJointPose('forearm.L', [-65, 0, 0]);
    model.root.updateMatrixWorld(true);
    expect(hand.getWorldPosition(new Vector3()).distanceTo(start)).toBeGreaterThan(.1);
    expect(toQuaternion(model.readJointPose('forearm.L')).angleTo(toQuaternion([-65, 0, 0]))).toBeLessThan(.00001);
    model.setJointPose('forearm.L', defaultValue('forearm.L', 'rotation'));
    expect(model.bones.get('forearm.L')!.quaternion.angleTo(original)).toBeLessThan(.00001);
    model.dispose();
  });

  it('round-trips rotations through nontrivial imported bind axes', () => {
    const group = new Group(); group.rotation.set(.4, .8, -.2);
    const bone = new Bone(); bone.rotation.set(-.7, .5, 1.1); group.add(bone); group.updateMatrixWorld(true);
    const original = bone.quaternion.clone();
    const adapter = createJointAdapter(bone, [0, 0, 12]);
    adapter.apply([0, 0, 12]);
    expect(bone.quaternion.angleTo(original)).toBeLessThan(.00001);
    adapter.apply([25, -35, 60]);
    expect(toQuaternion(adapter.read()).angleTo(toQuaternion([25, -35, 60]))).toBeLessThan(.00001);
    // A gizmo edits the source bone directly. Reading then applying must not jump.
    bone.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .3));
    const edited = bone.quaternion.clone();
    adapter.apply(adapter.read());
    expect(bone.quaternion.angleTo(edited)).toBeLessThan(.00001);
  });

  it('sizes gizmos to body parts and retains a usable touch minimum', () => {
    const head = gizmoSizeForPart(.3, 4, 38, 1, 900);
    const chest = gizmoSizeForPart(.6, 4, 38, 1, 900);
    expect(head).toBeCloseTo(chest / 2, 4);
    expect(gizmoSizeForPart(.3, 8, 38, 1, 900)).toBeCloseTo(head / 2, 4);
    expect(gizmoSizeForPart(.01, 4, 38, 1, 900, true)).toBeGreaterThan(gizmoSizeForPart(.01, 4, 38, 1, 900, false));
  });
});
