import * as THREE from 'three';
import type { Project } from '../core/project';
import { sampleWebEffect, type WebEffect } from '../core/webEffect';
import type { Mannequin } from './mannequin';

export function createWebLine(content: THREE.Group) {
  const geometry = new THREE.CylinderGeometry(.009, .009, 1, 6);
  const material = new THREE.MeshStandardMaterial({ color: '#aaa9a5', roughness: .65 });
  const web = new THREE.Mesh(geometry, material); web.visible = false; content.add(web);
  const hand = new THREE.Vector3(), end = new THREE.Vector3(), delta = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function show(effect: WebEffect | null, model: Mannequin | null) {
    web.visible = !!(model && effect);
    if (!model || !effect) return;
    model.root.updateMatrixWorld(true); model.bones.get('hand.R')!.getWorldPosition(hand); content.worldToLocal(hand);
    end.fromArray(effect.anchor); end.lerpVectors(hand, end, effect.progress);
    delta.subVectors(end, hand); web.position.copy(hand).addScaledVector(delta, .5);
    web.scale.set(1, Math.max(.001, delta.length()), 1); web.quaternion.setFromUnitVectors(up, delta.normalize());
  }
  return {
    show,
    update(project: Project, time: number, model: Mannequin | null) {
      show(sampleWebEffect(project, time), model);
    },
    dispose() { content.remove(web); geometry.dispose(); material.dispose(); },
  };
}
