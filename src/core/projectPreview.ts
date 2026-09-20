import { BONES, CAMERA_ID, sample, type Project, type SceneObject, type ShotCamera, type Vec3 } from './project';
import { sampleWebEffect, type WebEffect } from './webEffect';

export interface ProjectPreview {
  objects: Pick<SceneObject, 'id' | 'kind' | 'dimensions' | 'position' | 'rotation' | 'scale' | 'appearance' | 'geometry'>[];
  poses: Record<string, Record<string, Vec3>>;
  camera?: ShotCamera;
  web?: WebEffect;
}

// A small first-frame snapshot keeps full animation tracks out of the project list.
export function projectPreview(project: Project): ProjectPreview {
  const web = sampleWebEffect(project, 0);
  return {
    objects: project.objects.filter(object => !object.hidden).map(object => ({
      id: object.id, kind: object.kind, dimensions: object.dimensions, appearance: object.appearance, geometry: object.geometry,
      position: sample(project, 'model', 'position', 0, object.id),
      rotation: sample(project, 'model', 'rotation', 0, object.id),
      scale: sample(project, 'model', 'scale', 0, object.id),
    })),
    poses: Object.fromEntries(project.objects.filter(object => object.kind === 'humanoid' && !object.hidden)
      .map(object => [object.id, Object.fromEntries(BONES.map(bone => [bone.id, sample(project, bone.id, 'rotation', 0, object.id)]))])),
    ...(web ? { web } : {}),
    ...(project.camera ? { camera: {
      position: sample(project, 'model', 'position', 0, CAMERA_ID),
      rotation: sample(project, 'model', 'rotation', 0, CAMERA_ID),
    } } : {}),
  };
}
