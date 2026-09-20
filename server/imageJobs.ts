import type { ImageJob } from '../src/core/api';
import type { ImageRequest } from '../src/core/project';
import { sceneSignature } from '../src/core/proposals';
import { AppError, FileStore, type ProjectRecord } from './storage';
import type { Providers } from './providers';
import { firstFrame, lastFrame } from './media';

export class ImageJobs {
  private submitting = new Set<string>();
  constructor(private store: FileStore, private providers: Providers) {}
  async recover() {
    for (const job of await this.store.list<ImageJob>('image-jobs')) {
      if (job.status === 'running') await this.store.put('image-jobs', job.id, { ...job, status: 'failed', error: 'The server stopped during image generation. The provider may have charged for it. Start a new image only when ready.' });
    }
  }
  async create(projectId: string, input: ImageRequest) {
    const { id, prompt, guideAssetId, count = 1, paired = false } = input;
    if (this.submitting.has(id)) throw new AppError(409, 'SUBMITTING', 'This image request is being saved. Check its status.');
    this.submitting.add(id);
    try {
      try {
        const existing = await this.store.get<ImageJob>('image-jobs', id);
        if (existing.projectId !== projectId || existing.prompt !== prompt || existing.guideAssetId !== guideAssetId || (existing.count ?? 1) !== count || !!existing.paired !== paired) throw new AppError(409, 'ID_CONFLICT', 'This ID belongs to a different image request.');
        return existing;
      } catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
      if (paired && !guideAssetId) throw new AppError(400, 'GUIDE_REQUIRED', 'Matched frames require a composition preview.');
      if (!this.providers.configured.gemini) throw new AppError(503, 'GEMINI_NOT_CONFIGURED', 'Connect Gemini on the server to generate images.');
      const { project } = await this.store.get<ProjectRecord>('projects', projectId);
      const saved = project.generation?.imageRequest;
      if (saved?.id !== id || saved.prompt !== prompt || saved.guideAssetId !== guideAssetId || (saved.count ?? 1) !== count || !!saved.paired !== paired) throw new AppError(400, 'IMAGE_REQUEST_NOT_SAVED', 'Save this image request with your project before generating.');
      if (guideAssetId && (guideAssetId !== project.generation!.guideAssetId || project.generation!.sourceSignature !== sceneSignature(project))) throw new AppError(400, 'STALE_GUIDE', 'Create a current composition preview before generating a baseline.');
      if ((project.generation?.imageAssetIds?.length ?? 0) + count * (paired ? 2 : 1) > 24) throw new AppError(400, 'IMAGE_LIMIT', 'This project can store up to 24 generated images. Choose fewer alternatives.');
      const job: ImageJob = { ...input, projectId, status: 'running', createdAt: new Date().toISOString() };
      await this.store.put('image-jobs', id, job);
      void this.run(job).catch(() => console.error(`Could not save image request ${id}.`));
      return job;
    } finally { this.submitting.delete(id); }
  }
  private async run(job: ImageJob) {
    try {
      const source = job.guideAssetId ? await firstFrame(this.store, job.guideAssetId) : undefined;
      const end = job.paired && job.guideAssetId ? await lastFrame(this.store, job.guideAssetId) : undefined;
      const looks = ['a faithful, balanced interpretation', 'an alternative lighting treatment and color palette', 'an alternative material and atmosphere treatment'];
      for (let index = 0; index < (job.count ?? 1); index++) {
        const prompt = source ? `Render the supplied composition frame as one finished reference image for a video in the requested artistic medium. Preserve the camera angle, framing, subject placement, scale, poses and scene geometry. Replace proxy surfaces with the characters, setting, materials and style described below. No text, collage, panels or new camera angle. Produce ${looks[index]}, within the requested style. User direction: ${job.prompt}` : job.prompt;
        const image = await this.providers.image(prompt, source?.id);
        job = { ...job, assetId: job.assetId ?? image.id, assetIds: [...job.assetIds ?? [], image.id] };
        await this.store.put('image-jobs', job.id, job);
        if (end) {
          const last = await this.providers.image(`${prompt} The FIRST attached image is the LAST composition frame: preserve its ending pose, geometry and camera framing. The SECOND attached image is the finished FIRST frame: use it only for the exact same character identity, materials, lighting, colors and style; do not copy its starting pose.`, end.id, image.id);
          job = { ...job, assetIds: [...job.assetIds ?? [], last.id], imagePairs: { ...job.imagePairs, ...(last.id !== image.id ? { [image.id]: last.id } : {}) } };
          await this.store.put('image-jobs', job.id, job);
        }
      }
      job = { ...job, status: 'completed' };
    } catch (error) {
      job = { ...job, status: 'failed', error: error instanceof AppError ? error.message : 'Image generation failed. Check Gemini access and quota before starting another request.' };
    }
    await this.store.put('image-jobs', job.id, job);
  }
}
