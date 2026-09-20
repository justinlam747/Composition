import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Jobs } from '../server/jobs';
import { FileStore as Store } from '../server/storage';
import { mockProviders, referencePng } from './fixtures/providers';
import { sceneSignature } from '../src/core/proposals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollVeo, submitVeo } from '../server/veo';
import { veoInputError } from '../src/core/videoModels';
import { makeProject, parseProject } from '../src/core/project';
import type { FileStore, StoredJob } from '../server/storage';

const job = { model: 'veo-3.1-generate-preview', prompt: 'Pan across a forest', duration: 4, referenceAssetIds: [], requestId: 'models/veo-3.1-generate-preview/operations/test' } as unknown as StoredJob;
afterEach(() => vi.unstubAllGlobals());
describe('Veo generation', () => {
  it('routes saved jobs to Veo without fal and rejects model changes on retry', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'composition-veo-test-'));
    try {
      const store = new Store(directory); await store.init();
      const provider = mockProviders(store); provider.configured.fal = false;
      const submit = vi.spyOn(provider, 'submit');
      const project = makeProject(); project.duration = 4;
      const guide = await store.asset(Buffer.from('guide'), 'video/mp4', 'guide', { duration: 4 });
      project.generation = { guideAssetId: guide.id, sourceSignature: sceneSignature(project), videoModel: 'veo' };
      const first = await store.asset(referencePng, 'image/png', 'reference');
      const last = await store.asset(Buffer.concat([referencePng, Buffer.from('last')]), 'image/png', 'reference');
      const fetchMock = vi.fn().mockImplementation(async () => Response.json({ name: job.requestId }));
      vi.stubGlobal('fetch', fetchMock);
      await submitVeo(store, { ...job, baselineAssetId: first.id, lastBaselineAssetId: last.id, referenceAssetIds: [first.id, last.id] }, 'key');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).instances[0]).toMatchObject({
        image: { inlineData: { data: referencePng.toString('base64'), mimeType: 'image/png' } },
        lastFrame: { inlineData: { data: Buffer.concat([referencePng, Buffer.from('last')]).toString('base64') } },
      });
      await submitVeo(store, { ...job, duration: 8, referenceAssetIds: [first.id] }, 'key');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).instances[0].referenceImages).toEqual([{ image: { inlineData: { data: referencePng.toString('base64'), mimeType: 'image/png' } }, referenceType: 'asset' }]);
      const jobs = new Jobs(store, provider);
      const created = await jobs.create('veo-job', project, 'A slow pan');
      expect(created.model).toBe('veo-3.1-generate-preview');
      await vi.waitFor(async () => expect((await store.get<StoredJob>('jobs', 'veo-job')).status).toBe('queued'));
      expect((await jobs.create('veo-job', project, 'A slow pan')).id).toBe(created.id);
      expect(submit).toHaveBeenCalledTimes(1);
      project.generation.videoModel = 'seedance';
      await expect(jobs.create('veo-job', project, 'A slow pan')).rejects.toMatchObject({ code: 'ID_CONFLICT' });
    } finally {
      if (path.resolve(directory).startsWith(path.join(os.tmpdir(), 'composition-veo-test-'))) await rm(directory, { recursive: true, force: true });
    }
  });
  it('submits direction and duration to Gemini and retains the operation ID', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ name: job.requestId }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await submitVeo({} as FileStore, job, 'test-key')).toBe(job.requestId);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain('/models/veo-3.1-generate-preview:predictLongRunning');
    expect(request.headers['x-goog-api-key']).toBe('test-key');
    expect(JSON.parse(request.body)).toEqual({ instances: [{ prompt: job.prompt }], parameters: { durationSeconds: 4, aspectRatio: '16:9', resolution: '720p', sampleCount: 1 } });
  });
  it('polls without resubmitting and downloads authenticated MP4 output', async () => {
    const video = Buffer.from([0, 0, 0, 12, 102, 116, 121, 112, 0, 0, 0, 0]);
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ done: false }))
      .mockResolvedValueOnce(Response.json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/video:download' } }] } } }))
      .mockResolvedValueOnce(new Response(video));
    vi.stubGlobal('fetch', fetchMock);
    expect(await pollVeo(job, 'test-key')).toEqual({ status: 'running' });
    expect(await pollVeo(job, 'test-key')).toEqual({ status: 'completed', output: video });
    expect(fetchMock.mock.calls[2][1].headers).toEqual({ 'x-goog-api-key': 'test-key' });
  });
  it('never forwards the Gemini key to a redirected storage host', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/video:download' } }] } } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://storage.googleapis.com/output.mp4' } }))
      .mockResolvedValueOnce(new Response(Buffer.from('0000ftyp0000')));
    vi.stubGlobal('fetch', fetchMock);
    await pollVeo(job, 'test-key');
    expect(fetchMock.mock.calls[2][1].headers).toBeUndefined();
  });
  it('surfaces terminal errors and filtered results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ done: true, error: { code: 3 } })).mockResolvedValueOnce(Response.json({ done: true })));
    await expect(pollVeo(job, 'test-key')).rejects.toMatchObject({ code: 'VEO_FAILED', status: 422 });
    await expect(pollVeo(job, 'test-key')).rejects.toMatchObject({ code: 'NO_VIDEO' });
  });
  it('validates duration and image modes before spending credits', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect(veoInputError(5, [])).toContain('4, 6 or 8');
    expect(veoInputError(4, ['image'])).toContain('8 seconds');
    expect(veoInputError(8, ['a', 'b', 'c', 'd'])).toContain('three');
    expect(veoInputError(8, ['a', 'b'], 'a')).toContain('supporting');
    expect(veoInputError(8, ['a', 'b'], 'a', 'b')).toBeUndefined();
    await expect(submitVeo({} as FileStore, { ...job, duration: 5 }, 'key')).rejects.toMatchObject({ code: 'VEO_INPUT' });
    await expect(submitVeo({} as FileStore, job)).rejects.toMatchObject({ code: 'GEMINI_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('persists model selection and rejects unknown models', () => {
    const project = makeProject();
    project.generation = { guideAssetId: 'guide', sourceSignature: 'test', videoModel: 'veo' };
    expect(parseProject(JSON.stringify(project)).generation?.videoModel).toBe('veo');
    expect(() => parseProject(JSON.stringify({ ...project, generation: { ...project.generation, videoModel: 'unknown' } }))).toThrow();
  });
});
