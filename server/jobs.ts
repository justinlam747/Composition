import { createHash } from 'node:crypto';
import type { Project } from '../src/core/project';
import { sceneSignature, videoReferences } from '../src/core/proposals';
import { AppError, FileStore, type StoredJob } from './storage';
import type { Providers } from './providers';

export class Jobs {
  private active = new Set<string>();
  private submissions = new Set<string>();
  constructor(private store: FileStore, private providers: Providers) {}
  async recover() {
    for (const job of await this.store.list<StoredJob>('jobs')) {
      if (job.status === 'preparing' && !job.requestId) {
        await this.store.put('jobs', job.id, { ...job, status: 'failed', error: 'The server stopped during submission. Check your fal account before starting another request; it may already have been accepted.' });
      }
    }
  }
  async create(id: string, project: Project, prompt: string) {
    const extraReferences = project.generation?.referenceAssetIds;
    const baselineAssetId = project.generation?.baselineAssetId;
    const lastBaselineAssetId = baselineAssetId ? project.generation?.imagePairs?.[baselineAssetId] : undefined;
    const fingerprint = createHash('sha256').update(JSON.stringify({ projectId: project.id, signature: sceneSignature(project), guide: project.generation?.guideAssetId, prompt, ...(extraReferences?.length ? { extraReferences } : {}), ...(baselineAssetId ? { baselineAssetId } : {}), ...(lastBaselineAssetId ? { lastBaselineAssetId } : {}), ...(project.generation?.excludedReferenceAssetIds?.length ? { excludedReferenceAssetIds: project.generation.excludedReferenceAssetIds } : {}) })).digest('hex');
    if (this.submissions.has(id)) throw new AppError(409, 'SUBMITTING', 'This request is already being submitted. Check its status.');
    this.submissions.add(id);
    try {
      try { const existing = await this.store.get<StoredJob>('jobs', id); if (existing.fingerprint !== fingerprint) throw new AppError(409, 'ID_CONFLICT', 'That request ID already belongs to a different generation.'); return existing; }
      catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
      if (!this.providers.configured.fal) throw new AppError(503, 'FAL_NOT_CONFIGURED', 'Live video is unavailable: configure FAL_KEY on the server.');
      if (!project.generation || project.generation.sourceSignature !== sceneSignature(project)) throw new AppError(400, 'STALE_GUIDE', 'Export and preview a guide of the current scene first.');
      if (baselineAssetId && project.generation.imageSources?.[baselineAssetId] !== project.generation.guideAssetId) throw new AppError(400, 'STALE_BASELINE', 'Choose a baseline made from the current composition preview.');
      if (!Number.isInteger(project.duration) || project.duration < 4) throw new AppError(400, 'VIDEO_DURATION', 'Seedance output needs a whole duration of 4–10 seconds. Set the timeline and export again.');
      const guide = await this.store.requireAsset(project.generation.guideAssetId, 'guide');
      if (!guide.duration || Math.abs(guide.duration - project.duration) > .25) throw new AppError(400, 'GUIDE_DURATION', 'The guide duration does not match the scene. Export again.');
      const references = videoReferences(project);
      if (references.length > 9) throw new AppError(400, 'REFERENCE_LIMIT', 'Seedance accepts up to nine reference images. Remove extra references before generating.');
      await this.store.references(project);
      const job: StoredJob = { id, projectId: project.id, status: 'preparing', mode: 'live', guideAssetId: guide.id, referenceAssetIds: references, prompt,
        duration: project.duration, resolution: '720p', createdAt: new Date().toISOString(), model: this.providers.model, sourceSignature: sceneSignature(project), fingerprint, ...(baselineAssetId ? { baselineAssetId } : {}), ...(lastBaselineAssetId ? { lastBaselineAssetId } : {}), ...(project.generation?.excludedReferenceAssetIds?.length ? { excludedReferenceAssetIds: project.generation.excludedReferenceAssetIds } : {}) };
      await this.store.put('jobs', id, job);
      void this.submit(job).catch(() => console.error(`Could not persist generation ${job.id}. Check the data directory before restarting.`));
      return job;
    } finally { this.submissions.delete(id); }
  }
  private async submit(job: StoredJob) {
    this.active.add(job.id);
    try { job.requestId = await this.providers.submit(job); job.status = 'queued'; }
    catch (error) { job.status = 'failed'; job.error = this.message(error, 'Seedance submission failed. Check fal credentials, model access and quota. If the connection failed during submission, check your fal account before retrying.'); }
    finally { try { await this.store.put('jobs', job.id, job); } finally { this.active.delete(job.id); } }
  }
  async refresh(id: string) {
    const job = await this.store.get<StoredJob>('jobs', id);
    if (!job.requestId || ['completed', 'failed'].includes(job.status) || this.active.has(id)) return job;
    this.active.add(id);
    try {
      const update = await this.providers.poll(job);
      if (update.output) { const asset = await this.store.asset(update.output, 'video/mp4', 'output'); job.outputAssetId = asset.id; }
      if (update.status === 'completed' && !job.outputAssetId) throw new AppError(502, 'NO_VIDEO', 'Seedance completed without a video.');
      job.status = update.status; delete job.error;
    } catch (error) {
      const status = (error as { status?: number }).status;
      // Network failures are retryable status checks, never a reason to resubmit a paid job.
      if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422 || error instanceof AppError && ['NO_VIDEO', 'INVALID_OUTPUT', 'INVALID_OUTPUT_URL'].includes(error.code)) job.status = 'failed';
      job.error = this.message(error, 'Could not retrieve Seedance output. Check model access and the provider job; status checks will retry without submitting again.');
    } finally { try { await this.store.put('jobs', job.id, job); } finally { this.active.delete(id); } }
    return job;
  }
  async tick() { for (const job of await this.store.list<StoredJob>('jobs')) if (job.requestId && !['completed', 'failed'].includes(job.status)) await this.refresh(job.id); }
  private message(error: unknown, fallback: string) { return error instanceof AppError ? error.message : fallback; }
}
