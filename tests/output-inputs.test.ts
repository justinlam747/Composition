import { describe, expect, it } from 'vitest';
import { makeProject, validateProject } from '../src/core/project';
import { sceneSignature, videoReferences } from '../src/core/proposals';
import { excludeVideoReference, removeOutputImage } from '../src/core/outputImages';

function project() {
  const p = makeProject(); p.objects[0].referenceAssetIds = ['object-image'];
  p.generation = { guideAssetId: 'guide', sourceSignature: sceneSignature(p), imageAssetIds: ['first', 'last', 'uploaded'], imageSources: { first: 'guide', last: 'guide' }, imagePairs: { first: 'last' }, baselineAssetId: 'first', referenceAssetIds: ['uploaded'] };
  return p;
}
describe('output reference selection', () => {
  it('orders selected endpoint frames before supporting references and validates saved metadata', () => {
    const p = project(); validateProject(p);
    expect(videoReferences(p)).toEqual(['first', 'last', 'object-image', 'uploaded']);
    p.generation!.imagePairs!.first = 'missing'; expect(() => validateProject(p)).toThrow();
  });
  it('removes image metadata and prevents polling from restoring deleted images', () => {
    const p = project(); p.generation = removeOutputImage(p.generation!, 'first', ['first', 'last']); validateProject(p);
    expect(p.generation.baselineAssetId).toBeUndefined(); expect(p.generation.imagePairs).toEqual({});
    expect(p.generation.imageSources).toEqual({}); expect(p.generation.dismissedImageAssetIds).toContain('first');
    expect(videoReferences(p)).toEqual(['object-image', 'uploaded']);
  });
  it('excludes object references without modifying objects or invalidating the guide', () => {
    const p = project(), signature = sceneSignature(p);
    p.generation = excludeVideoReference(p, 'object-image'); validateProject(p);
    expect(p.objects[0].referenceAssetIds).toEqual(['object-image']); expect(sceneSignature(p)).toBe(signature);
    expect(videoReferences(p)).toEqual(['first', 'last', 'uploaded']);
    p.generation = excludeVideoReference(p, 'last'); expect(videoReferences(p)).toEqual(['uploaded']);
  });
  it('prunes obsolete exclusions instead of invalidating the project after repeated removals', () => {
    const p = project(); p.generation!.excludedReferenceAssetIds = Array.from({ length: 288 }, (_, i) => `old-${i}`);
    p.generation = excludeVideoReference(p, 'uploaded'); validateProject(p);
    expect(p.generation!.excludedReferenceAssetIds).toEqual([]);
  });
  it('retains deleted job results when many unrelated uploads are removed later', () => {
    const p = project(), jobAssets = ['first', 'last'];
    p.generation = removeOutputImage(p.generation!, 'first', jobAssets);
    for (let i = 0; i < 30; i++) p.generation = removeOutputImage(p.generation, `upload-${i}`, jobAssets);
    expect(p.generation.dismissedImageAssetIds).toEqual(['first']); validateProject(p);
  });
  it('deselects an uploaded image that shares its asset with an object reference', () => {
    const p = project(); p.generation!.referenceAssetIds = ['object-image'];
    p.generation = excludeVideoReference(p, 'object-image');
    expect(videoReferences(p)).not.toContain('object-image');
    expect(p.objects[0].referenceAssetIds).toEqual(['object-image']); validateProject(p);
  });
});
