import { z } from 'zod';
import { BONES, HUMANOID_ID, makeObject, sample, uid, validateProject, type Project, type SceneObject, type Track, type Vec3 } from './project';

const vector = z.tuple([z.number().finite().min(-10000).max(10000), z.number().finite().min(-10000).max(10000), z.number().finite().min(-10000).max(10000)]);
const dimensions = z.tuple([z.number().min(.05).max(20), z.number().min(.05).max(20), z.number().min(.05).max(20)]);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const objectSpecSchema = z.object({ name: z.string().trim().min(1).max(120), kind: z.enum(['box', 'humanoid']), dimensions, scale: vector.refine(v => v.every(n => n >= .05 && n <= 10)).optional(), referenceAssetIds: z.array(id).max(9) }).strict();
export type ObjectSpec = z.infer<typeof objectSpecSchema>;
const keySchema = z.object({ time: z.number().finite().min(0).max(10), value: vector, ease: z.enum(['smooth', 'linear']) }).strict();
export const proposalContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('object'), object: objectSpecSchema }).strict(),
  z.object({ kind: z.literal('composition'), placements: z.array(z.object({ objectId: id, position: vector, rotation: vector }).strict()).min(1).max(32) }).strict(),
  z.object({ kind: z.literal('movement'), tracks: z.array(z.object({ objectId: id, target: z.string().max(40), channel: z.enum(['position', 'rotation', 'scale']), keys: z.array(keySchema).min(2).max(60) }).strict()).min(1).max(40) }).strict(),
]);
export type ProposalContent = z.infer<typeof proposalContentSchema>;
export type ProposalKind = ProposalContent['kind'];
export interface Proposal { id: string; mode: 'live' | 'demo'; baseSignature: string; prompt: string; content: ProposalContent }

// A change detector, not a security digest. Excludes output metadata so saving a guide never stales a proposal.
export function sceneSignature(project: Project): string {
  const text = JSON.stringify({ id: project.id, duration: project.duration, objects: project.objects, tracks: project.tracks, ...(project.camera ? { camera: project.camera } : {}), ...(project.clips?.length ? { clips: project.clips } : {}) });
  let hash = 2166136261, second = 5381;
  for (let i = 0; i < text.length; i++) { hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ text.charCodeAt(i); }
  return `${text.length}-${hash >>> 0}-${second >>> 0}`;
}
export function videoReferences(project: Project): string[] {
  return [...new Set([...(project.generation?.baselineAssetId ? [project.generation.baselineAssetId] : []), ...project.objects.filter(o => !o.hidden).flatMap(o => o.referenceAssetIds), ...project.generation?.referenceAssetIds ?? []])];
}
export function objectFromSpec(spec: ObjectSpec, project: Project): SceneObject {
  const checked = objectSpecSchema.parse(spec);
  const object = makeObject(checked.kind, project.objects.filter(o => o.kind === 'box').length);
  return { ...object, ...checked, scale: checked.scale ?? object.scale };
}
export function applyProposal(project: Project, proposal: Proposal): Project {
  if (proposal.baseSignature !== sceneSignature(project)) throw new Error('The scene changed. Request a new suggestion before applying.');
  const content = proposalContentSchema.parse(proposal.content);
  const next = structuredClone(project);
  if (content.kind === 'object') next.objects.push(objectFromSpec(content.object, next));
  if (content.kind === 'composition') {
    const seen = new Set<string>();
    for (const placement of content.placements) {
      const object = next.objects.find(o => o.id === placement.objectId && !o.hidden);
      if (!object || seen.has(object.id)) throw new Error('Composition contains an unknown or repeated object.');
      seen.add(object.id);
      // Move the whole path with the placement so an animated object actually moves.
      const position = sample(project, 'model', 'position', 0, object.id);
      const rotation = sample(project, 'model', 'rotation', 0, object.id);
      for (const channel of ['position', 'rotation'] as const) {
        const origin = channel === 'position' ? position : rotation;
        const delta = placement[channel].map((v, i) => v - origin[i]);
        object[channel] = object[channel].map((v, i) => v + delta[i]) as Vec3;
        const offset = (value: Vec3) => value.map((v, i) => v + delta[i]) as Vec3;
        next.tracks.filter(t => t.objectId === object.id && t.target === 'model' && t.channel === channel).forEach(t => {
          t.keys = t.keys.map(k => ({ ...k, value: offset(k.value), ...(k.rotationPath ? { rotationPath: k.rotationPath.map(offset) } : {}) }));
        });
        next.clips?.filter(clip => clip.objectId === object.id).forEach(clip => {
          clip.tracks.filter(track => track.target === 'model' && track.channel === channel).forEach(track => {
            track.keys = track.keys.map(key => ({ ...key, value: offset(key.value), ...(key.rotationPath ? { rotationPath: key.rotationPath.map(offset) } : {}) }));
          });
          if (channel === 'position' && clip.web) clip.web.anchor = offset(clip.web.anchor);
        });
      }
    }
  }
  if (content.kind === 'movement') {
    const replacements: Track[] = content.tracks.map(t => ({ ...t, keys: t.keys.map(k => ({ ...k, id: uid() })) }));
    // Validate replacements together before merging; duplicates must never silently overwrite each other.
    validateProject({ ...next, tracks: replacements });
    next.tracks = next.tracks.filter(t => !replacements.some(r => r.objectId === t.objectId && r.target === t.target && r.channel === t.channel)).concat(replacements);
    if (next.clips) next.clips = next.clips.filter(clip => !replacements.some(track => track.objectId === clip.objectId));
  }
  return validateProject(next);
}

export function demoProposal(project: Project, kind: ProposalKind, prompt: string, objectId: string): Proposal {
  let content: ProposalContent;
  if (kind === 'object') content = { kind, object: { name: 'Demo plinth', kind: 'box', dimensions: [.8, 1, .8], referenceAssetIds: [] } };
  else if (kind === 'composition') content = { kind, placements: project.objects.filter(o => !o.hidden).map((o, i) => ({ objectId: o.id, position: [(i - (project.objects.length - 1) / 2) * 1.6, 0, 0], rotation: [0, 0, 0] })) };
  else {
    const object = project.objects.find(o => o.id === objectId && !o.hidden);
    if (!object) throw new Error('Add or select an object first.');
    const start = sample(project, 'model', 'position', 0, object.id);
    const times = [0, Math.round(project.duration * 15) / 30, project.duration];
    content = { kind, tracks: [{ objectId, target: 'model', channel: 'position', keys: times.map((time, i) => ({ time, ease: 'smooth', value: [start[0] + (i === 1 ? 1 : 0), start[1], start[2]] })) }] };
    if (object.id === HUMANOID_ID) content.tracks.push({ objectId, target: 'head', channel: 'rotation', keys: times.map((time, i) => ({ time, ease: 'smooth', value: [i === 1 ? 15 : 0, 0, 0] })) });
  }
  return { id: uid(), mode: 'demo', baseSignature: sceneSignature(project), prompt, content };
}
export const movementJointIds = BONES.map(b => b.id);
