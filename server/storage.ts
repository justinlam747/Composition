import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { validId, uid, type Project } from '../src/core/project';
import type { Asset, Job, SavedObject } from '../src/core/api';
import type { Proposal } from '../src/core/proposals';

export class AppError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export class FileStore {
  private operations = new Map<string, Promise<unknown>>();
  constructor(readonly root: string) {}
  async init() { await Promise.all(['assets', 'projects', 'objects', 'proposals', 'jobs', 'image-jobs', 'motion-jobs', 'tmp'].map(dir => mkdir(path.join(this.root, dir), { recursive: true }))); }
  file(collection: string, id: string, extension = 'json') {
    if (!validId(id)) throw new AppError(400, 'INVALID_ID', 'Invalid record ID.');
    return path.join(this.root, collection, `${id}.${extension}`);
  }
  async put(collection: string, id: string, value: unknown) {
    const file = this.file(collection, id), serialized = JSON.stringify(value, null, 2);
    await this.exclusive(file, async () => {
      const temporary = `${file}.${uid()}.tmp`;
      try {
        await writeFile(temporary, serialized);
        for (let attempt = 0; ; attempt++) {
          try { await rename(temporary, file); break; }
          catch (error) {
            if (attempt >= 7 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
            await delay(20 * (attempt + 1));
          }
        }
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
  }
  async get<T>(collection: string, id: string): Promise<T> {
    const file = this.file(collection, id);
    try { return await this.exclusive(file, async () => JSON.parse(await readFile(file, 'utf8')) as T); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new AppError(404, 'NOT_FOUND', 'This saved record could not be found.'); throw error; }
  }
  private async exclusive<T>(file: string, action: () => Promise<T>): Promise<T> {
    const operation = (this.operations.get(file) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.operations.set(file, operation);
    try { return await operation; } finally { if (this.operations.get(file) === operation) this.operations.delete(file); }
  }
  async remove(collection: string, id: string) {
    const file = this.file(collection, id);
    await this.exclusive(file, () => unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }));
  }
  async list<T>(collection: string): Promise<T[]> {
    const files = await readdir(path.join(this.root, collection));
    const records = await Promise.all(files.filter(f => f.endsWith('.json')).map(f => this.get<T>(collection, f.slice(0, -5)).catch(error => {
      if (error instanceof AppError && error.status === 404) return undefined;
      throw error;
    })));
    return records.filter(record => record !== undefined) as T[];
  }
  async asset(bytes: Buffer, mimeType: string, role: Asset['role'], metadata: Partial<Pick<Asset, 'duration' | 'width' | 'height'>> = {}): Promise<Asset> {
    const id = createHash('sha256').update(role).update(bytes).digest('hex');
    try { return await this.get<Asset>('assets', id); } catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
    const asset: Asset = { id, mimeType, role, size: bytes.length, createdAt: new Date().toISOString(), ...metadata };
    await writeFile(this.file('assets', id, 'bin'), bytes); await this.put('assets', id, asset); return asset;
  }
  async requireAsset(id: string, role?: Asset['role']) { const asset = await this.get<Asset>('assets', id); if (role && asset.role !== role) throw new AppError(400, 'ASSET_ROLE', `Expected a ${role} asset.`); return asset; }
  async references(project: Project) {
    const ids = [...new Set(project.objects.flatMap(o => o.referenceAssetIds))];
    await Promise.all(ids.map(id => this.requireAsset(id, 'reference')));
    if (project.generation) {
      await Promise.all([...new Set([...project.generation.imageAssetIds ?? [], ...project.generation.referenceAssetIds ?? []])].map(id => this.requireAsset(id, 'reference')));
      await this.requireAsset(project.generation.guideAssetId, 'guide');
      await Promise.all([...new Set(Object.values(project.generation.imageSources ?? {}))].map(id => this.requireAsset(id, 'guide')));
      if (project.generation.outputAssetId) await this.requireAsset(project.generation.outputAssetId, 'output');
    }
  }
}
export type ProjectRecord = { project: Project; updatedAt: string };
export type StoredJob = Job & { model: string; sourceSignature: string; fingerprint: string; baselineAssetId?: string };
export type StoredRecord = ProjectRecord | Proposal | StoredJob | SavedObject;
