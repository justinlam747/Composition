import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { makeObject, makeProject, parseProject, validateProject } from '../src/core/project';
import { deskGeometry, propGeometrySchema } from '../src/core/propGeometry';
import { createProp } from '../src/scene/prop';
import { objectFromSpec, sceneSignature } from '../src/core/proposals';
import { projectPreview } from '../src/core/projectPreview';

describe('composite props', () => {
  it('renders a desk with selectable parts, exact dimensions and a bottom pivot', () => {
    const object = { ...makeObject('box'), dimensions: [1.4, .75, .7] as [number, number, number], geometry: deskGeometry() };
    const prop = createProp(object);
    expect(prop.meshes).toHaveLength(5);
    expect(prop.meshes.every(mesh => mesh.userData.objectId === object.id)).toBe(true);
    const bounds = new Box3().setFromObject(prop.root), size = bounds.getSize(new Vector3());
    object.dimensions.forEach((value, axis) => expect(size.getComponent(axis)).toBeCloseTo(value));
    expect(bounds.min.y).toBeCloseTo(0);
    prop.resize([2, 1, 1]);
    expect(new Box3().setFromObject(prop.root).max.y).toBeCloseTo(1);
    prop.dispose();
  });
  it('preserves geometry through project, library and thumbnail contracts', () => {
    const project = makeProject(), object = { ...makeObject('box'), geometry: deskGeometry() };
    const before = sceneSignature(project); project.objects.push(object);
    const parsed = parseProject(JSON.stringify(project));
    expect(parsed.objects[1].geometry).toEqual(object.geometry);
    expect(projectPreview(parsed).objects[1].geometry).toEqual(object.geometry);
    const copy = objectFromSpec({ name: object.name, kind: object.kind, dimensions: object.dimensions, referenceAssetIds: [], geometry: object.geometry }, project);
    expect(copy.geometry).toEqual(object.geometry);
    expect(sceneSignature(parsed)).not.toBe(before);
  });
  it('rejects invalid or oversized geometry and geometry on a humanoid', () => {
    expect(propGeometrySchema.safeParse({ parts: Array(33).fill(deskGeometry().parts[0]) }).success).toBe(false);
    const geometry = deskGeometry(); geometry.parts[0].size[0] = NaN;
    expect(propGeometrySchema.safeParse(geometry).success).toBe(false);
    const project = makeProject(); project.objects[0].geometry = deskGeometry();
    expect(() => validateProject(project)).toThrow('Invalid prop geometry');
  });
  it('keeps legacy boxes intact', () => {
    const prop = createProp(makeObject('box'));
    expect(prop.meshes).toHaveLength(1); expect(prop.root.children).toHaveLength(1); prop.dispose();
  });
});
