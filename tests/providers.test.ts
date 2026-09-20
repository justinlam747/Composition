import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileStore, type StoredJob } from '../server/storage';
import { makeProject } from '../src/core/project';
import { liveProviders } from '../server/providers';
import { referencePng } from './fixtures/providers';
const mocks = vi.hoisted(() => ({ config: vi.fn(), upload: vi.fn(), submit: vi.fn(), status: vi.fn(), result: vi.fn() }));
vi.mock('@fal-ai/client', () => ({ createFalClient: (config: unknown) => { mocks.config(config); return { storage: { upload: mocks.upload }, queue: { submit: mocks.submit, status: mocks.status, result: mocks.result } }; } }));

describe('live provider request contracts (transport mocked, no paid calls)', () => {
  let store: FileStore, directory: string;
  beforeEach(async () => { vi.clearAllMocks(); vi.stubEnv('GEMINI_API_KEY', 'test-only-gemini-key'); vi.stubEnv('FAL_KEY', 'test-only-fal-key'); directory = await mkdtemp(path.join(os.tmpdir(), 'composition-provider-test-')); store = new FileStore(directory); await store.init(); });
  afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); const resolved = path.resolve(directory); if (resolved.startsWith(path.join(os.tmpdir(), 'composition-provider-test-'))) await rm(resolved, { recursive: true, force: true }); });
  it('requests Gemini JSON, then an image, and stores its actual bytes under a reference ID', async () => {
    const content = { kind: 'object', object: { name: 'Oak plinth', kind: 'box', dimensions: [1, .5, 1], referenceAssetIds: [] } };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(content) }] } }] })).mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: referencePng.toString('base64') } }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const proposal = await liveProviders(store).propose(makeProject(), 'object', 'Oak plinth', 'humanoid');
    expect(proposal.mode).toBe('live'); expect(proposal.content.kind).toBe('object');
    const first = fetchMock.mock.calls[0], second = fetchMock.mock.calls[1];
    expect(first[0]).toContain(':generateContent'); expect(first[1].headers['x-goog-api-key']).toBe('test-only-gemini-key');
    expect(JSON.parse(first[1].body).generationConfig.responseJsonSchema.properties.kind.const).toBe('object');
    expect(JSON.parse(second[1].body).generationConfig.responseModalities).toContain('IMAGE');
    if (proposal.content.kind !== 'object') throw new Error('Wrong proposal');
    expect(await store.requireAsset(proposal.content.object.referenceAssetIds[0])).toMatchObject({ role: 'reference', size: referencePng.length });
  });
  it('rejects malformed output and provider errors without creating a demo suggestion', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"kind":"movement","tracks":[]}' }] } }] })).mockResolvedValueOnce(new Response('quota', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock); const provider = liveProviders(store);
    await expect(provider.propose(makeProject(), 'movement', 'wave', 'humanoid')).rejects.toMatchObject({ code: 'INVALID_PROPOSAL' });
    await expect(provider.propose(makeProject(), 'object', 'box', 'humanoid')).rejects.toMatchObject({ code: 'GEMINI_REQUEST_FAILED' });
  });
  it('generates a standalone image from the exact output prompt without creating scene objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: referencePng.toString('base64') } }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await liveProviders(store).image('A sunlit room with oak furniture');
    expect(result).toMatchObject({ role: 'reference', mimeType: 'image/png', size: referencePng.length });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts).toEqual([{ text: 'A sunlit room with oak furniture' }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.responseModalities).toContain('IMAGE');
  });
  it('uploads the MP4 and references, submits all inputs and downloads the completed result', async () => {
    const guide = await store.asset(Buffer.from('guide'), 'video/mp4', 'guide'), reference = await store.asset(referencePng, 'image/png', 'reference');
    mocks.upload.mockImplementation(async (blob: Blob) => {
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (blob.type === 'video/mp4') { expect(bytes).toEqual(Buffer.from('guide')); return 'https://fal.media/guide.mp4'; }
      expect(blob.type).toBe('image/png'); expect(bytes).toEqual(referencePng); return 'https://fal.media/reference.png';
    });
    mocks.submit.mockResolvedValue({ request_id: 'fal-request' });
    const provider = liveProviders(store);
    const job: StoredJob = { id: 'job', projectId: 'project', status: 'preparing', mode: 'live', guideAssetId: guide.id, referenceAssetIds: [reference.id], prompt: 'Warm daylight', duration: 5, resolution: '720p', model: provider.model, sourceSignature: 'test', fingerprint: 'test', createdAt: new Date().toISOString() };
    expect(await provider.submit(job)).toBe('fal-request');
    const input = mocks.submit.mock.calls[0][1].input;
    expect(input).toMatchObject({ video_urls: ['https://fal.media/guide.mp4'], image_urls: ['https://fal.media/reference.png'], duration: '5', resolution: '720p', aspect_ratio: '16:9' });
    expect(input.prompt).toContain('@Video1'); expect(input.prompt).toContain('@Image1'); expect(input.prompt).toContain('Warm daylight');
    expect(mocks.upload.mock.calls.map(([blob]) => blob.type).sort()).toEqual(['image/png', 'video/mp4']);
    expect(mocks.config.mock.calls[0][0]).toMatchObject({ credentials: 'test-only-fal-key', retry: { maxRetries: 0 } });
    mocks.status.mockResolvedValue({ status: 'COMPLETED' }); mocks.result.mockResolvedValue({ data: { video: { url: 'https://fal.media/output.mp4' } } });
    const video = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 0, 0, 0, 0]); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(video)));
    expect(await provider.poll({ ...job, requestId: 'fal-request' })).toEqual({ status: 'completed', output: video });
  });
  it('sends actual frame bytes to Gemini and ignores intermediate thought images', async () => {
    const source = await store.asset(referencePng, 'image/png', 'reference');
    const generated = Buffer.concat([referencePng, Buffer.from('finished')]);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, inlineData: { mimeType: 'image/png', data: referencePng.toString('base64') } },
      { inlineData: { mimeType: 'image/png', data: generated.toString('base64') } },
    ] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await liveProviders(store).image('Keep the layout, use daylight', source.id);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts).toEqual([{ text: 'Keep the layout, use daylight' }, { inlineData: { mimeType: 'image/png', data: referencePng.toString('base64') } }]);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    expect(result.size).toBe(generated.length);
  });
  it('explicitly identifies the selected baseline separately from supporting references in Seedance', async () => {
    const guide = await store.asset(Buffer.from('guide'), 'video/mp4', 'guide');
    const baseline = await store.asset(referencePng, 'image/png', 'reference');
    const support = await store.asset(Buffer.concat([referencePng, Buffer.from('support')]), 'image/png', 'reference');
    mocks.upload.mockResolvedValue('https://fal.media/input'); mocks.submit.mockResolvedValue({ request_id: 'baseline-video' });
    const provider = liveProviders(store);
    await provider.submit({ id: 'job', projectId: 'project', status: 'preparing', mode: 'live', guideAssetId: guide.id, referenceAssetIds: [baseline.id, support.id], baselineAssetId: baseline.id, prompt: 'Natural motion', duration: 5, resolution: '720p', model: provider.model, sourceSignature: 'test', fingerprint: 'test', createdAt: new Date().toISOString() });
    const input = mocks.submit.mock.calls[0][1].input;
    expect(input.prompt).toContain('@Image1 as the chosen visual baseline');
    expect(input.prompt).toContain('@Image2 as supporting object appearance references');
    expect(input.prompt).toContain('motion in @Video1');
    expect(input.image_urls).toHaveLength(2);
  });
  it('passes both ending geometry and starting appearance to Gemini in that order', async () => {
    const end = await store.asset(referencePng, 'image/png', 'reference');
    const lookBytes = Buffer.concat([referencePng, Buffer.from('look')]);
    const look = await store.asset(lookBytes, 'image/png', 'reference');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: referencePng.toString('base64') } }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await liveProviders(store).image('Same look, ending pose', end.id, look.id);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts.slice(1).map((part: { inlineData: { data: string } }) => part.inlineData.data)).toEqual([referencePng.toString('base64'), lookBytes.toString('base64')]);
  });
  it('labels the selected ending frame separately from supporting images in video requests', async () => {
    const guide = await store.asset(Buffer.from('guide'), 'video/mp4', 'guide');
    const first = await store.asset(referencePng, 'image/png', 'reference');
    const last = await store.asset(Buffer.concat([referencePng, Buffer.from('last')]), 'image/png', 'reference');
    mocks.upload.mockResolvedValue('https://fal.media/input'); mocks.submit.mockResolvedValue({ request_id: 'paired-video' });
    const provider = liveProviders(store);
    await provider.submit({ id: 'job', projectId: 'project', status: 'preparing', mode: 'live', guideAssetId: guide.id, referenceAssetIds: [first.id, last.id], baselineAssetId: first.id, lastBaselineAssetId: last.id, prompt: 'Natural motion', duration: 5, resolution: '720p', model: provider.model, sourceSignature: 'test', fingerprint: 'test', createdAt: new Date().toISOString() });
    const input = mocks.submit.mock.calls[0][1].input;
    expect(input.prompt).toContain('@Image2 as the last-frame appearance');
    expect(input.prompt).not.toContain('supporting object');
  });
});
