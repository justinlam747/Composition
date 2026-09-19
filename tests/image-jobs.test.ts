import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { createApp } from '../server/app';
import { ImageJobs } from '../server/imageJobs';
import { makeProject, uid, validateProject } from '../src/core/project';
import { sceneSignature } from '../src/core/proposals';
import { mockProviders, referencePng } from './fixtures/providers';
import type { ImageJob } from '../src/core/api';

describe('output image generation (provider mocked)', () => {
  let directory: string, context: Awaited<ReturnType<typeof createApp>>;
  const image = vi.fn();
  beforeEach(async () => {
    image.mockReset();
    directory = await mkdtemp(path.join(os.tmpdir(), 'composition-image-test-'));
    context = await createApp({ dataDir: directory, providers: store => ({ ...mockProviders(store), image }) });
    image.mockImplementation(() => context.store.asset(referencePng, 'image/png', 'reference'));
  });
  afterEach(async () => {
    if (path.resolve(directory).startsWith(path.join(os.tmpdir(), 'composition-image-test-'))) await rm(directory, { recursive: true, force: true });
  });
  async function prepared(prompt = 'Soft light, oak furniture') {
    const project = makeProject(), id = uid();
    const guide = await context.store.asset(Buffer.from('test guide'), 'video/mp4', 'guide', { duration: project.duration });
    project.generation = { guideAssetId: guide.id, sourceSignature: sceneSignature(project), imageRequest: { id, prompt } };
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    return { project, input: { id, projectId: project.id, prompt } };
  }
  async function completed(id: string) {
    await vi.waitFor(async () => expect((await context.store.get<ImageJob>('image-jobs', id)).status).toBe('completed'));
    return context.store.get<ImageJob>('image-jobs', id);
  }
  it('saves an image, reuses the same request after response loss, and includes selected images in video output', async () => {
    const { project, input } = await prepared();
    await request(context.app).post('/api/image-jobs').send(input).expect(202);
    const job = await completed(input.id);
    await request(context.app).post('/api/image-jobs').send(input).expect(202);
    expect(image).toHaveBeenCalledTimes(1);
    expect(await readFile(context.store.file('assets', job.assetId!, 'bin'))).toEqual(referencePng);
    await request(context.app).post('/api/image-jobs').send({ ...input, prompt: 'Changed instructions' }).expect(409);
    const signature = sceneSignature(project);
    project.generation = { ...project.generation!, imageAssetIds: [job.assetId!], referenceAssetIds: [job.assetId!] };
    expect(sceneSignature(project)).toBe(signature);
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    const videoId = uid();
    const video = await request(context.app).post('/api/jobs').send({ id: videoId, project, prompt: 'Follow the guide', mode: 'live' }).expect(202);
    expect(video.body.referenceAssetIds).toEqual([job.assetId]);
    await vi.waitFor(async () => expect((await context.store.get<{ status: string }>('jobs', videoId)).status).toBe('queued'));
    project.generation.referenceAssetIds = [];
    await request(context.app).post('/api/jobs').send({ id: videoId, project, prompt: 'Follow the guide', mode: 'live' }).expect(409);
  });
  it('validates saved request identity and persists failures without silently trying again', async () => {
    const { input } = await prepared();
    await request(context.app).post('/api/image-jobs').send({ ...input, id: uid() }).expect(400);
    await request(context.app).post('/api/image-jobs').send({ ...input, prompt: '' }).expect(400);
    expect(image).not.toHaveBeenCalled();
    image.mockRejectedValue(new Error('provider failed'));
    await request(context.app).post('/api/image-jobs').send(input).expect(202);
    await vi.waitFor(async () => expect((await context.store.get<ImageJob>('image-jobs', input.id)).status).toBe('failed'));
    const response = await request(context.app).post('/api/image-jobs').send(input).expect(202);
    expect(response.body.status).toBe('failed'); expect(image).toHaveBeenCalledTimes(1);
    await request(context.app).get('/api/image-jobs/missing').expect(404);
  });
  it('rejects simultaneous duplicates and recovers interrupted requests without generating again', async () => {
    const { input } = await prepared();
    const responses = await Promise.all([request(context.app).post('/api/image-jobs').send(input), request(context.app).post('/api/image-jobs').send(input)]);
    expect(responses.map(r => r.status)).toContain(202);
    expect(responses.every(r => r.status === 202 || r.status === 409)).toBe(true);
    await completed(input.id); expect(image).toHaveBeenCalledTimes(1);
    const stopped = { ...input, status: 'running', createdAt: new Date().toISOString() };
    await context.store.put('image-jobs', input.id, stopped);
    const providers = { ...mockProviders(context.store), image };
    const jobs = new ImageJobs(context.store, providers); await jobs.recover();
    expect(await context.store.get<ImageJob>('image-jobs', input.id)).toMatchObject({ status: 'failed' });
    expect(image).toHaveBeenCalledTimes(1);
  });
  it('validates generated image metadata and missing provider configuration', async () => {
    const { project, input } = await prepared();
    expect(() => validateProject({ ...project, generation: { ...project.generation, referenceAssetIds: ['../invalid'] } })).toThrow();
    const providers = mockProviders(context.store); providers.configured.gemini = false;
    await expect(new ImageJobs(context.store, providers).create(input.projectId, { id: input.id, prompt: input.prompt })).rejects.toMatchObject({ code: 'GEMINI_NOT_CONFIGURED' });
    expect(image).not.toHaveBeenCalled();
  });
  async function framed() {
    const { project, input } = await prepared();
    const frame = await context.store.asset(referencePng, 'image/png', 'reference');
    const guide = await context.store.requireAsset(project.generation!.guideAssetId);
    await context.store.put('assets', guide.id, { ...guide, firstFrameAssetId: frame.id });
    const variantInput = { ...input, guideAssetId: guide.id, count: 3 as const };
    project.generation!.imageRequest = { id: input.id, prompt: input.prompt, guideAssetId: guide.id, count: 3 };
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    return { project, input: variantInput, frame };
  }
  it('uses the same first frame for three alternatives and sends only the chosen baseline first to video', async () => {
    const { project, input, frame } = await framed();
    image.mockImplementation(() => context.store.asset(Buffer.concat([referencePng, Buffer.from([image.mock.calls.length])]), 'image/png', 'reference'));
    await request(context.app).post('/api/image-jobs').send(input).expect(202);
    const job = await completed(input.id);
    expect(job.assetIds).toHaveLength(3);
    expect(new Set(image.mock.calls.map(([prompt]) => prompt)).size).toBe(3);
    expect(image.mock.calls.every(([prompt, source]) => source === frame.id && prompt.includes('Preserve the camera angle') && prompt.includes(input.prompt))).toBe(true);
    await request(context.app).post('/api/image-jobs').send(input).expect(202);
    expect(image).toHaveBeenCalledTimes(3);
    await request(context.app).post('/api/image-jobs').send({ ...input, count: 1 }).expect(409);
    await request(context.app).post('/api/image-jobs').send({ ...input, guideAssetId: 'changed-guide' }).expect(409);
    project.generation = { ...project.generation!, imageAssetIds: job.assetIds, imageSources: Object.fromEntries(job.assetIds!.map(id => [id, input.guideAssetId])), baselineAssetId: job.assetIds![1] };
    project.objects[0].referenceAssetIds = [frame.id];
    project.generation.sourceSignature = sceneSignature(project);
    const videoId = uid();
    const video = await request(context.app).post('/api/jobs').send({ id: videoId, project, prompt: 'Follow the guide', mode: 'live' }).expect(202);
    expect(video.body.referenceAssetIds).toEqual([job.assetIds![1], frame.id]);
    expect(video.body.baselineAssetId).toBe(job.assetIds![1]);
    await vi.waitFor(async () => expect((await context.store.get<{ status: string }>('jobs', videoId)).status).toBe('queued'));
    project.generation.baselineAssetId = job.assetIds![2];
    await request(context.app).post('/api/jobs').send({ id: videoId, project, prompt: 'Follow the guide', mode: 'live' }).expect(409);
    project.generation.imageSources![job.assetIds![2]] = 'older-guide';
    const stale = await request(context.app).post('/api/jobs').send({ id: uid(), project, prompt: 'Follow the guide', mode: 'live' }).expect(400);
    expect(stale.body.error.code).toBe('STALE_BASELINE');
  });
  it('keeps completed alternatives if a later generation fails and does not replay them on retry', async () => {
    const { input } = await framed();
    image.mockImplementationOnce(() => context.store.asset(referencePng, 'image/png', 'reference')).mockRejectedValueOnce(new Error('provider failed'));
    await request(context.app).post('/api/image-jobs').send(input).expect(202);
    await vi.waitFor(async () => expect((await context.store.get<ImageJob>('image-jobs', input.id)).status).toBe('failed'));
    const job = (await request(context.app).get(`/api/image-jobs/${input.id}`).expect(200)).body;
    expect(job.assetIds).toHaveLength(1);
    await request(context.app).post('/api/image-jobs').send(input).expect(202);
    expect(image).toHaveBeenCalledTimes(2);
    await context.store.put('image-jobs', input.id, { ...job, status: 'running' });
    await new ImageJobs(context.store, mockProviders(context.store)).recover();
    expect(await context.store.get<ImageJob>('image-jobs', input.id)).toMatchObject({ status: 'failed', assetIds: job.assetIds });
  });
  it('rejects stale first-frame input and oversized batches before making provider calls', async () => {
    const { project, input, frame } = await framed();
    await request(context.app).post('/api/image-jobs').send({ ...input, count: 2 }).expect(400);
    await request(context.app).post('/api/image-jobs').send({ ...input, guideAssetId: 'different' }).expect(400);
    project.objects[0].position[0] += 1;
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    expect((await request(context.app).post('/api/image-jobs').send(input).expect(400)).body.error.code).toBe('STALE_GUIDE');
    project.generation!.sourceSignature = sceneSignature(project);
    project.generation!.imageAssetIds = Array(23).fill(frame.id);
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    expect((await request(context.app).post('/api/image-jobs').send(input).expect(400)).body.error.code).toBe('IMAGE_LIMIT');
    expect(image).not.toHaveBeenCalled();
  });
});
