import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Texture, TextureLoader } from 'three';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { retargetHunyuanMotion } from '../src/scene/motionRetarget';
import { buildMannequin } from '../src/scene/mannequin';
import { HUMANOID_ID, type AnimationAsset, type Project } from '../src/core/project';
import type { MotionJob } from '../src/core/api';
import { sceneSignature } from '../src/core/proposals';
import { AppError, FileStore } from './storage';
import type { Providers } from './providers';

// FBXLoader and the mannequin are renderer-independent, but the Three loaders
// expect these browser globals when they parse an asset in Node.
Object.assign(globalThis, { window: { URL } });
TextureLoader.prototype.load = function () { return new Texture(); };

type StoredMotionJob = MotionJob & { project: Project };

export class MotionJobs {
  private running = new Set<string>();
  constructor(private store: FileStore, private providers: Providers) {}

  async recover() {
    for (const job of await this.store.list<StoredMotionJob>('motion-jobs')) {
      if (job.status === 'running') await this.store.put('motion-jobs', job.id, { ...job, status: 'failed', error: 'The motion generation stopped during server restart. Start a new regeneration request.' });
    }
  }

  async create(project: Project, input: { id: string; prompt: string; duration: number }) {
    if (!this.providers.configured.hunyuanMotion) throw new AppError(503, 'HUNYUAN_MOTION_NOT_CONFIGURED', 'Hunyuan Motion is unavailable: configure FAL_KEY on the server.');
    if (!project.objects.some(object => object.id === HUMANOID_ID && !object.hidden)) throw new AppError(400, 'NO_HUMANOID', 'Add a visible humanoid before generating motion.');
    if (!Number.isFinite(input.duration) || input.duration < .5 || input.duration > 10) throw new AppError(400, 'MOTION_DURATION', 'Motion duration must be between 0.5 and 10 seconds.');
    if (!input.prompt.trim()) throw new AppError(400, 'MOTION_PROMPT', 'Describe one humanoid action before generating motion.');
    try { return await this.store.get<StoredMotionJob>('motion-jobs', input.id); }
    catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
    const job: StoredMotionJob = { id: input.id, projectId: project.id, status: 'running', createdAt: new Date().toISOString(), prompt: input.prompt, duration: input.duration, model: 'fal-ai/hunyuan-motion', baseSignature: sceneSignature(project), project };
    await this.store.put('motion-jobs', job.id, job);
    if (!this.running.has(job.id)) { this.running.add(job.id); void this.run(job).finally(() => this.running.delete(job.id)); }
    return job;
  }

  async get(id: string) { return this.store.get<MotionJob>('motion-jobs', id); }

  private async run(job: StoredMotionJob) {
    try {
      const bytes = await this.providers.motion(job.prompt, job.duration);
      const source = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      const modelBytes = await readFile(path.resolve('public/models/humanoid.glb'));
      const gltf = await new GLTFLoader().parseAsync(modelBytes.buffer.slice(modelBytes.byteOffset, modelBytes.byteOffset + modelBytes.byteLength), '');
      const mannequin = buildMannequin(gltf.scene);
      try {
        const animation: AnimationAsset = retargetHunyuanMotion(source, mannequin, { id: `hunyuan-motion-${job.id}`, name: job.prompt.trim().slice(0, 120), duration: job.duration });
        await this.store.put('motion-jobs', job.id, { ...job, status: 'completed', animation });
      } finally { mannequin.dispose(); }
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Hunyuan Motion could not be retargeted onto the editor mannequin.';
      await this.store.put('motion-jobs', job.id, { ...job, status: 'failed', error: message });
    }
  }
}
