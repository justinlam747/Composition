import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app';
import { refineOutputPrompt } from '../server/promptRefinement';
import { makeProject } from '../src/core/project';
import { sceneSignature } from '../src/core/proposals';
import { referencePng, mockProviders } from './fixtures/providers';

describe('Gemini output prompt refinement', () => {
  let directory: string, context: Awaited<ReturnType<typeof createApp>>;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'composition-prompt-test-')); context = await createApp({ dataDir: directory, providers: mockProviders }); vi.stubEnv('GEMINI_API_KEY', 'test-key'); });
  afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); if (path.resolve(directory).startsWith(path.join(os.tmpdir(), 'composition-prompt-test-'))) await rm(directory, { recursive: true, force: true }); });
  async function prepared() {
    const project = makeProject(), frame = await context.store.asset(referencePng, 'image/png', 'reference');
    const guide = await context.store.asset(Buffer.from('guide'), 'video/mp4', 'guide');
    await context.store.put('assets', guide.id, { ...guide, firstFrameAssetId: frame.id });
    project.generation = { guideAssetId: guide.id, sourceSignature: sceneSignature(project) }; return project;
  }
  it('analyzes intent with the local bank and actual first-frame bytes, returning a validated editable draft', async () => {
    const project = await prepared();
    const uploaded = Buffer.concat([referencePng, Buffer.from('uploaded visual reference')]);
    const asset = await context.store.asset(uploaded, 'image/png', 'reference');
    project.generation!.imageAssetIds = [asset.id]; project.generation!.uploadedImageAssetIds = [asset.id];
    const result = await mockProviders(context.store).refinePrompt(project, 'video', 'toy hero');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'ignore this' }, { text: JSON.stringify(result) }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await refineOutputPrompt(context.store, project, 'video', 'toy hero', 'previous draft')).toEqual(result);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toContain('Infer from meaning');
    expect(body.systemInstruction.parts[0].text).toContain('distortion');
    expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({ request: 'toy hero', previous: 'previous draft', target: 'video' });
    expect(body.contents[0].parts[1].inlineData.data).toBe(referencePng.toString('base64'));
    expect(body.contents[0].parts[3].inlineData.data).toBe(uploaded.toString('base64'));
    expect(project.generation!.instructions).toBeUndefined();
  });
  it('rejects malformed or blocked responses and stale guides without overwriting the user prompt', async () => {
    const project = await prepared(); project.generation!.instructions = 'Original';
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] })).mockResolvedValueOnce(new Response('quota', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(refineOutputPrompt(context.store, project, 'baseline', 'clay')).rejects.toMatchObject({ code: 'INVALID_REFINED_PROMPT' });
    await expect(refineOutputPrompt(context.store, project, 'baseline', 'clay')).rejects.toMatchObject({ code: 'PROMPT_REFINEMENT_FAILED' });
    project.objects[0].position[0] += 1;
    await expect(refineOutputPrompt(context.store, project, 'baseline', 'clay')).rejects.toMatchObject({ code: 'STALE_GUIDE' });
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(project.generation!.instructions).toBe('Original');
  });
  it('validates the API boundary and offers drafts for both fields', async () => {
    const project = await prepared();
    for (const target of ['video', 'baseline']) {
      const result = await request(context.app).post('/api/output-prompts').send({ project, target, prompt: 'Toy hero' }).expect(200);
      expect(result.body.prompt).toContain('Toy hero'); expect(result.body.qualities.camera).toBeTruthy();
    }
    await request(context.app).post('/api/output-prompts').send({ project, target: 'other', prompt: 'Toy hero' }).expect(400);
    await request(context.app).post('/api/output-prompts').send({ project, target: 'video', prompt: ' ' }).expect(400);
  });
});
