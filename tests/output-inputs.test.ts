import { describe, expect, it } from 'vitest';
import { makeProject, validateProject } from '../src/core/project';
import { sceneSignature, videoReferences } from '../src/core/proposals';
import { excludeVideoReference, imageGenerationReferences, removeOutputImage } from '../src/core/outputImages';

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
  it('uses uploads independently of video selection and supports legacy uploaded references', () => {
    const p = project(); expect(imageGenerationReferences(p.generation)).toEqual(['uploaded']);
    p.generation!.uploadedImageAssetIds = ['uploaded']; p.generation!.referenceAssetIds = [];
    expect(imageGenerationReferences(p.generation)).toEqual(['uploaded']);
    p.generation = removeOutputImage(p.generation!, 'uploaded');
    expect(imageGenerationReferences(p.generation)).toEqual([]); validateProject(p);
  });
  it('accepts large galleries and frame metadata without the old image/pair limits', () => {
    const p = project(), ids = Array.from({ length: 80 }, (_, i) => `image-${i}`);
    p.generation = { ...p.generation!, baselineAssetId: undefined, imageAssetIds: ids, uploadedImageAssetIds: ids.slice(40), imageSources: Object.fromEntries(ids.slice(0, 40).map(id => [id, 'guide'])), imagePairs: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [ids[i * 2], ids[i * 2 + 1]])), dismissedImageAssetIds: ids };
    validateProject(p); expect(imageGenerationReferences(p.generation)).toHaveLength(40);
  });
});
