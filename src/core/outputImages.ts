import type { Generation, Project } from './project';

export function imageGenerationReferences(generation?: Generation): string[] {
  // Projects saved before uploads had their own metadata used source-free gallery images.
  return [...new Set(generation?.uploadedImageAssetIds ?? generation?.imageAssetIds?.filter(id => !generation.imageSources?.[id]) ?? [])];
}

// Remove only output inputs. Source files may also belong to objects or other projects.
export function removeOutputImage(generation: Generation, id: string, jobAssetIds: readonly string[] = []): Generation {
  const { baselineAssetId, ...retained } = generation;
  return { ...retained, ...(baselineAssetId && baselineAssetId !== id ? { baselineAssetId } : {}),
    imageAssetIds: generation.imageAssetIds?.filter(value => value !== id),
    uploadedImageAssetIds: imageGenerationReferences(generation).filter(value => value !== id),
    referenceAssetIds: generation.referenceAssetIds?.filter(value => value !== id),
    imageSources: Object.fromEntries(Object.entries(generation.imageSources ?? {}).filter(([key]) => key !== id && key !== generation.imagePairs?.[id])),
    imagePairs: Object.fromEntries(Object.entries(generation.imagePairs ?? {}).filter(([first, last]) => first !== id && last !== id)),
    dismissedImageAssetIds: [...new Set([...generation.dismissedImageAssetIds ?? [], id])].filter(value => jobAssetIds.includes(value)),
  };
}

export function excludeVideoReference(project: Project, id: string): Generation | undefined {
  const generation = project.generation;
  if (!generation) return;
  const { baselineAssetId, ...retained } = generation;
  const isBaseline = baselineAssetId === id || !!baselineAssetId && generation.imagePairs?.[baselineAssetId] === id;
  const objectReferences = new Set(project.objects.flatMap(object => object.referenceAssetIds));
  return { ...retained, ...(baselineAssetId && !isBaseline ? { baselineAssetId } : {}),
    referenceAssetIds: generation.referenceAssetIds?.filter(value => value !== id),
    excludedReferenceAssetIds: [...new Set([...generation.excludedReferenceAssetIds ?? [], id])].filter(value => objectReferences.has(value)),
  };
}
