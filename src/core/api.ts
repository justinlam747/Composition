import type { AnimationAsset, ImageRequest, Project, SceneObject } from './project';
import type { ObjectSpec, Proposal, ProposalKind } from './proposals';
import type { ProjectPreview } from './projectPreview';
export interface Asset { id: string; mimeType: string; size: number; role: 'reference' | 'guide' | 'output'; createdAt: string; duration?: number; width?: number; height?: number; firstFrameAssetId?: string }
export interface Job { id: string; projectId: string; status: 'preparing' | 'queued' | 'running' | 'completed' | 'failed'; mode: 'live'; guideAssetId: string; referenceAssetIds: string[]; prompt: string; duration: number; resolution: '720p'; createdAt: string; outputAssetId?: string; error?: string; requestId?: string }
export interface SavedObject { id: string; object: ObjectSpec; createdAt: string }
export interface ImageJob extends ImageRequest { projectId: string; status: 'running' | 'completed' | 'failed'; createdAt: string; assetId?: string; assetIds?: string[]; error?: string }
export interface MotionJob { id: string; projectId: string; status: 'running' | 'completed' | 'failed'; createdAt: string; prompt: string; duration: number; model: 'fal-ai/hunyuan-motion'; baseSignature: string; animation?: AnimationAsset; error?: string }
export interface Capabilities { gemini: boolean; fal: boolean; hunyuanMotion: boolean; videoExport: boolean }
export interface ProjectSummary { id: string; name: string; updatedAt: string; duration: number; objectCount: number; hasMotion: boolean; preview?: ProjectPreview }
export const assetUrl = (id: string, download = false) => `/api/assets/${encodeURIComponent(id)}/file${download ? '?download=1' : ''}`;
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(180_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? `Request failed (${response.status}). Check the server connection.`);
  return body as T;
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const api = {
  capabilities: () => request<Capabilities>('/capabilities'),
  upload: (blob: Blob, role: 'reference' | 'guide', duration?: number) => request<Asset>(`/assets?role=${role}${duration ? `&duration=${duration}` : ''}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob }),
  saveProject: (project: Project) => request<Project>(`/projects/${project.id}`, { ...json(project), method: 'PUT' }),
  projects: () => request<ProjectSummary[]>('/projects'),
  project: (id: string) => request<Project>(`/projects/${id}`),
  deleteProject: (id: string) => request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  propose: (kind: ProposalKind, prompt: string, project: Project, objectId: string, signal: AbortSignal) => request<Proposal>('/proposals', { ...json({ kind, prompt, project, objectId, mode: 'live' }), signal }),
  saveObject: (object: ObjectSpec | SceneObject) => request<SavedObject>('/objects', json({ name: object.name, kind: object.kind, dimensions: object.dimensions, scale: object.scale, referenceAssetIds: object.referenceAssetIds })),
  objects: () => request<SavedObject[]>('/objects'),
  generate: (project: Project, prompt: string, id: string) => request<Job>('/jobs', json({ project, prompt, id, mode: 'live' })),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  guideFrame: (id: string) => request<Asset>(`/assets/${id}/first-frame`),
  generateImage: (projectId: string, imageRequest: ImageRequest) => request<ImageJob>('/image-jobs', json({ projectId, ...imageRequest })),
  imageJob: (id: string) => request<ImageJob>(`/image-jobs/${id}`),
  generateMotion: (project: Project, prompt: string, duration: number, id: string, signal?: AbortSignal) => request<MotionJob>('/motion-jobs', { ...json({ project, prompt, duration, id }), ...(signal ? { signal } : {}) }),
  motionJob: (id: string) => request<MotionJob>(`/motion-jobs/${id}`),
};
