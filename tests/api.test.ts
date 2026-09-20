import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import ffmpeg from 'ffmpeg-static';
import { createApp } from '../server/app';
import { mockProviders, referencePng } from './fixtures/providers';
import { makeProject, uid } from '../src/core/project';
import { sceneSignature } from '../src/core/proposals';
import { liveProviders } from '../server/providers';
import type { StoredJob } from '../server/storage';

describe('server contracts and file persistence', () => {
  let context: Awaited<ReturnType<typeof createApp>>, directory: string, guideBytes: Buffer;
  const submits = vi.fn();
  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'composition-api-test-'));
    context = await createApp({ dataDir: directory, providers: store => { const provider = mockProviders(store); return { ...provider, submit: job => { submits(job); return provider.submit(job); } }; } });
    const guide = path.join(directory, 'fixture.webm');
    await promisify(execFile)(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '5', '-an', '-c:v', 'libvpx', '-deadline', 'realtime', guide], { timeout: 30000, windowsHide: true });
    guideBytes = await readFile(guide);
  }, 30000);
  afterAll(async () => { const resolved = path.resolve(directory); if (resolved.startsWith(path.join(os.tmpdir(), 'composition-api-test-'))) await rm(resolved, { recursive: true, force: true }); });
  it('stores images and projects with stable IDs, reopens them, and serves downloads with range support', async () => {
    const asset = await request(context.app).post('/api/assets?role=reference').set('Content-Type', 'image/png').send(referencePng).expect(201);
    const duplicate = await request(context.app).post('/api/assets?role=reference').set('Content-Type', 'image/png').send(referencePng).expect(201);
    expect(duplicate.body.id).toBe(asset.body.id);
    const project = makeProject(); project.objects[0].referenceAssetIds = [asset.body.id];
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    const reopened = await request(context.app).get(`/api/projects/${project.id}`).expect(200); expect(reopened.body).toEqual(project);
    const file = await request(context.app).get(`/api/assets/${asset.body.id}/file?download=1`).expect(200);
    expect(file.headers['content-disposition']).toContain('attachment'); expect(file.body).toEqual(referencePng);
    await request(context.app).get(`/api/assets/${asset.body.id}/file`).set('Range', 'bytes=0-7').expect(206);
    await request(context.app).post('/api/objects').send({ name: 'Reference prop', kind: 'box', dimensions: [1, 1, 1], referenceAssetIds: [asset.body.id] }).expect(201);
    const fresh = await createApp({ dataDir: directory, providers: mockProviders });
    expect((await request(fresh.app).get('/api/objects')).body[0].object.referenceAssetIds).toEqual([asset.body.id]);
    expect((await request(fresh.app).get('/api/projects')).body).toContainEqual({
      id: project.id, name: project.name, updatedAt: expect.any(String), duration: project.duration, objectCount: 1, hasMotion: false,
      preview: expect.objectContaining({ objects: expect.any(Array), poses: expect.any(Object) }),
    });
    expect((await request(fresh.app).get(`/api/projects/${project.id}`)).body).toEqual(project);
  });
  it('serializes concurrent reads and atomic replacements on Windows', async () => {
    await context.store.put('projects', 'concurrency-test', { revision: 0 });
    const operations = Array.from({ length: 30 }, (_, revision) => [context.store.get('projects', 'concurrency-test'), context.store.put('projects', 'concurrency-test', { revision: revision + 1 })]).flat();
    await Promise.all(operations);
    expect(await context.store.get('projects', 'concurrency-test')).toEqual({ revision: 30 });
    // Keep the projects collection valid for subsequent list tests.
    await context.store.put('projects', 'concurrency-test', { project: makeProject(), updatedAt: new Date().toISOString() });
  });
  it('deletes a project without deleting shared media and tolerates retries', async () => {
    const asset = await request(context.app).post('/api/assets?role=reference').set('Content-Type', 'image/png').send(referencePng).expect(201);
    const project = makeProject(); project.objects[0].referenceAssetIds = [asset.body.id];
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    await request(context.app).delete(`/api/projects/${project.id}`).expect(204);
    await request(context.app).get(`/api/projects/${project.id}`).expect(404);
    await request(context.app).delete(`/api/projects/${project.id}`).expect(204);
    expect((await request(context.app).get('/api/projects')).body.some((item: { id: string }) => item.id === project.id)).toBe(false);
    await request(context.app).get(`/api/assets/${asset.body.id}/file`).expect(200);
  });
  it('rejects missing references, unsafe uploads, foreign origins, and malformed suggestions', async () => {
    const project = makeProject(); project.objects[0].referenceAssetIds = ['missing'];
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(404);
    await request(context.app).post('/api/assets?role=reference').set('Content-Type', 'image/svg+xml').send(Buffer.from('<svg />')).expect(400);
    await request(context.app).post('/api/jobs').set('Origin', 'https://untrusted.example').send({}).expect(403);
    await request(context.app).post('/api/proposals').send({ project: makeProject(), mode: 'live', kind: 'movement', prompt: 'INVALID_TEST', objectId: 'humanoid' }).expect(400);
    const saved = await request(context.app).get('/api/projects').expect(200); expect(saved.body.some((p: { id: string }) => p.id === project.id)).toBe(false);
  });
  it('converts a real browser-format guide to MP4 and completes an idempotent mocked video job', async () => {
    const asset = await request(context.app).post('/api/assets?role=guide&duration=5').set('Content-Type', 'video/webm').send(guideBytes).expect(201);
    expect(asset.body).toMatchObject({ role: 'guide', mimeType: 'video/mp4', width: 1280, height: 720 }); expect(asset.body.duration).toBeCloseTo(5, 1);
    const project = makeProject(); project.generation = { guideAssetId: asset.body.id, sourceSignature: sceneSignature(project) };
    const id = uid(), body = { id, project, prompt: 'Mock only', mode: 'live' };
    await request(context.app).post('/api/jobs').send(body).expect(202);
    await expect.poll(async () => (await context.store.get<StoredJob>('jobs', id)).requestId).toBeTruthy();
    const completed = await request(context.app).get(`/api/jobs/${id}`).expect(200);
    expect(completed.body.status).toBe('completed'); expect(completed.body.mode).toBe('live');
    const output = await request(context.app).get(`/api/assets/${completed.body.outputAssetId}/file?download=1`).expect(200);
    expect(output.headers['content-type']).toContain('video/mp4');
    await request(context.app).post('/api/jobs').send(body).expect(202); expect(submits.mock.calls.filter(([job]) => job.id === id)).toHaveLength(1);
    await request(context.app).post('/api/jobs').send({ ...body, prompt: 'Different input' }).expect(409);
    const stale = structuredClone(project); stale.objects[0].position[0] = 2;
    await request(context.app).post('/api/jobs').send({ ...body, id: uid(), project: stale }).expect(400);
    project.generation.outputAssetId = completed.body.outputAssetId; project.generation.jobId = id;
    await request(context.app).put(`/api/projects/${project.id}`).send(project).expect(200);
    const fresh = await createApp({ dataDir: directory, providers: mockProviders });
    expect((await request(fresh.app).get(`/api/projects/${project.id}`)).body.generation).toEqual(project.generation);
  }, 30000);
  it('reports provider failure without substituting output and resumes queued jobs after restart', async () => {
    const assets = await context.store.list<{ id: string; role: string }>('assets'), guide = assets.find(a => a.role === 'guide')!;
    const project = makeProject(); project.generation = { guideAssetId: guide.id, sourceSignature: sceneSignature(project) };
    const id = uid();
    await request(context.app).post('/api/jobs').send({ id, project, prompt: 'FAIL_TEST', mode: 'live' }).expect(202);
    await expect.poll(async () => (await context.store.get<StoredJob>('jobs', id)).status).toBe('failed');
    const failed = (await request(context.app).get(`/api/jobs/${id}`)).body;
    expect(failed.error).toContain('Test provider rejected'); expect(failed.outputAssetId).toBeUndefined();
    const recovered = { ...await context.store.get<StoredJob>('jobs', id), id: uid(), status: 'queued' as const, requestId: 'mock-restart' }; delete recovered.error;
    await context.store.put('jobs', recovered.id, recovered);
    const fresh = await createApp({ dataDir: directory, providers: mockProviders });
    expect((await request(fresh.app).get(`/api/jobs/${recovered.id}`)).body.status).toBe('completed');
  });
  it('missing live credentials are explicit, and Demo is never a backend fallback', async () => {
    const gemini = process.env.GEMINI_API_KEY, fal = process.env.FAL_KEY;
    delete process.env.GEMINI_API_KEY; delete process.env.FAL_KEY;
    try {
      const live = await createApp({ dataDir: directory, providers: liveProviders });
      expect((await request(live.app).get('/api/capabilities')).body).toMatchObject({ gemini: false, fal: false });
      const result = await request(live.app).post('/api/proposals').send({ project: makeProject(), mode: 'live', kind: 'object', prompt: 'plinth', objectId: 'humanoid' }).expect(503);
      expect(result.body.error.code).toBe('GEMINI_NOT_CONFIGURED');
      await request(live.app).post('/api/jobs').send({ id: uid(), project: makeProject(), mode: 'live', prompt: 'video' }).expect(503);
      await request(live.app).post('/api/jobs').send({ id: uid(), project: makeProject(), mode: 'demo', prompt: 'video' }).expect(400);
    } finally { if (gemini !== undefined) process.env.GEMINI_API_KEY = gemini; if (fal !== undefined) process.env.FAL_KEY = fal; }
  });
});
