import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app';
import { Director } from '../server/director';
import { AppError, FileStore } from '../server/storage';
import { mockProviders } from './fixtures/providers';
import { makeProject, uid, type AnimationAsset, type Project } from '../src/core/project';
import { sceneSignature } from '../src/core/proposals';
import type { DirectorInput, DirectorProposal } from '../src/core/director';
import type { MotionJob } from '../src/core/api';

const wave: AnimationAsset = { id: 'wave', name: 'Wave', kind: 'humanoid', source: 'ai', duration: 2, tracks: [{ objectId: 'humanoid', target: 'arm.L', channel: 'rotation', keys: [{ id: 'k0', time: 0, value: [0, 0, 0], ease: 'linear' }, { id: 'k1', time: 2, value: [0, 0, 90], ease: 'linear' }] }] };
function input(project = makeProject()): DirectorInput { return { project, sessionId: uid(), messages: [], text: 'Add a desk here', context: { objectId: null, clipId: null, time: 0, placement: [2, 0, 1] } }; }
function decision(proposal: DirectorProposal, project: Project, action = 'approve') { return { sessionId: proposal.sessionId, revision: proposal.revision, decision: action, project }; }

describe('director backend', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'composition-director-test-')); });
  afterEach(async () => { if (path.resolve(directory).startsWith(path.join(os.tmpdir(), 'composition-director-test-'))) await rm(directory, { recursive: true, force: true }); });
  it('clarifies, proposes, requires approval, and never saves an unaccepted project', async () => {
    const context = await createApp({ dataDir: directory, providers: mockProviders }); const body = input();
    const clarification = await request(context.app).post('/api/director/turns').send({ ...body, context: { ...body.context, placement: null } }).expect(200);
    expect(clarification.body.proposal).toBeUndefined(); expect(clarification.body.message).toContain('Pick placement');
    const response = await request(context.app).post('/api/director/turns').send(body).expect(200); const proposal = response.body.proposal as DirectorProposal;
    expect(proposal.status).toBe('pending'); expect(await context.store.list('director-executions')).toEqual([]);
    await request(context.app).post(`/api/director/proposals/${proposal.id}/decision`).send(decision(proposal, body.project)).expect(200);
    await vi.waitFor(async () => expect((await context.director.get(proposal.id)).status).toBe('ready'));
    expect(await context.store.list('projects')).toEqual([]);
    const duplicate = await context.director.decide(proposal.id, decision(proposal, body.project)); expect(duplicate.id).toBe(proposal.id);
    expect(await context.store.list('director-executions')).toHaveLength(1);
  });
  it('rejects cross-project, stale and superseded approval', async () => {
    const context = await createApp({ dataDir: directory, providers: mockProviders }); const body = input();
    const proposal = (await context.director.turn(body)).proposal!;
    await expect(context.director.decide(proposal.id, decision(proposal, makeProject()))).rejects.toMatchObject({ code: 'DIRECTOR_SESSION_CHANGED' });
    const changed = structuredClone(body.project); changed.objects[0].position = [4, 0, 0];
    await expect(context.director.decide(proposal.id, decision(proposal, changed))).rejects.toMatchObject({ code: 'DIRECTOR_STALE' });
    const refreshed = await context.director.decide(proposal.id, decision(proposal, changed, 'refresh'));
    expect(refreshed.proposal.revision).toBe(2); expect(refreshed.proposal.status).toBe('pending');
    await expect(context.director.decide(proposal.id, decision(proposal, changed))).rejects.toMatchObject({ code: 'DIRECTOR_REVISION_CHANGED' });
    await context.director.turn(body);
    await expect(context.director.decide(proposal.id, decision(refreshed.proposal, changed))).rejects.toMatchObject({ code: 'DIRECTOR_CANCELLED' });
  });
  it('does not call Hunyuan before approval, and preserves generated motion when refreshing', async () => {
    const store = new FileStore(directory); await store.init();
    const provider = mockProviders(store); provider.director = async () => ({ kind: 'proposal', message: 'Wave for two seconds.', actions: [{ kind: 'generate_motion', prompt: 'Wave', start: 0, duration: 2 }] });
    const create = vi.fn(async (project: Project, args: { id: string; prompt: string; duration: number }) => ({ ...args, project, projectId: project.id, status: 'completed' as const, createdAt: '', model: 'fal-ai/hunyuan-motion' as const, baseSignature: sceneSignature(project), animation: wave }));
    const director = new Director(store, provider, { create, get: async () => { throw new Error('Not needed'); } }); const body = input();
    const proposal = (await director.turn(body)).proposal!; expect(create).not.toHaveBeenCalled();
    await director.decide(proposal.id, decision(proposal, body.project));
    await vi.waitFor(async () => expect((await director.get(proposal.id)).status).toBe('ready'));
    expect(create).toHaveBeenCalledTimes(1);
    const changed = structuredClone(body.project); changed.objects[0].position = [3, 0, 0];
    const refreshed = await director.decide(proposal.id, decision(proposal, changed, 'refresh'));
    expect(refreshed.animations[0].id).toBe('wave'); expect(refreshed.proposal.baseSignature).toBe(sceneSignature(changed));
    await director.decide(proposal.id, decision(refreshed.proposal, changed));
    await vi.waitFor(async () => expect((await director.get(proposal.id)).status).toBe('ready'));
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('cancels a running generation without applying its late result', async () => {
    const store = new FileStore(directory); await store.init(); const provider = mockProviders(store);
    provider.director = async () => ({ kind: 'proposal', message: 'Wave.', actions: [{ kind: 'generate_motion', prompt: 'Wave', start: 0, duration: 2 }] });
    let resolve!: (value: MotionJob & { project: Project }) => void;
    const create = vi.fn(() => new Promise<MotionJob & { project: Project }>(done => { resolve = done; }));
    const director = new Director(store, provider, { create, get: async () => { throw new Error('Not needed'); } }); const body = input();
    const proposal = (await director.turn(body)).proposal!;
    await director.decide(proposal.id, decision(proposal, body.project)); await vi.waitFor(() => expect(create).toHaveBeenCalled());
    await director.decide(proposal.id, decision(proposal, body.project, 'cancel'));
    resolve({ id: uid(), project: body.project, projectId: body.project.id, prompt: 'Wave', duration: 2, status: 'completed', createdAt: '', model: 'fal-ai/hunyuan-motion', baseSignature: sceneSignature(body.project), animation: wave });
    await new Promise(done => setTimeout(done, 80)); expect((await director.get(proposal.id)).status).toBe('cancelled');
  });
  it('reports failed jobs and interrupted preparation without changing project state', async () => {
    const store = new FileStore(directory); await store.init(); const provider = mockProviders(store);
    provider.director = async () => ({ kind: 'proposal', message: 'Wave.', actions: [{ kind: 'generate_motion', prompt: 'Wave', start: 0, duration: 2 }] });
    const director = new Director(store, provider, { create: async () => { throw new Error('Quota exhausted'); }, get: async () => { throw new Error('Not needed'); } }); const body = input();
    const proposal = (await director.turn(body)).proposal!; await director.decide(proposal.id, decision(proposal, body.project));
    await vi.waitFor(async () => expect((await director.get(proposal.id)).status).toBe('failed'));
    expect((await director.get(proposal.id)).error).toContain('Quota');
    const record = await store.get<Record<string, unknown>>('director-executions', proposal.id);
    await store.put('director-executions', proposal.id, { ...record, status: 'running' }); await director.recover();
    expect((await director.get(proposal.id)).error).toContain('restarted'); expect(await store.list('projects')).toEqual([]);
  });
  it('returns actionable capability and validation errors', async () => {
    const context = await createApp({ dataDir: directory, providers: store => { const provider = mockProviders(store); provider.configured.gemini = false; return provider; } });
    expect((await request(context.app).get('/api/capabilities')).body.director).toBe(false);
    expect((await request(context.app).post('/api/director/turns').send(input()).expect(503)).body.error.code).toBe('GEMINI_NOT_CONFIGURED');
    await request(context.app).post('/api/director/turns').send({ text: 'hello' }).expect(400);
  });
  it('retries a recovered motion reference whose job was never created', async () => {
    const store = new FileStore(directory); await store.init(); const provider = mockProviders(store);
    provider.director = async () => ({ kind: 'proposal', message: 'Wave.', actions: [{ kind: 'generate_motion', prompt: 'Wave', start: 0, duration: 2 }] });
    const create = vi.fn(async (project: Project, args: { id: string; prompt: string; duration: number }) => ({ ...args, project, projectId: project.id, status: 'completed' as const, createdAt: '', model: 'fal-ai/hunyuan-motion' as const, baseSignature: sceneSignature(project), animation: wave }));
    const director = new Director(store, provider, { create, get: async () => { throw new AppError(404, 'NOT_FOUND', 'Missing job'); } });
    const body = input(), proposal = (await director.turn(body)).proposal!, jobId = uid();
    await store.put('director-executions', proposal.id, { id: proposal.id, project: body.project, proposal, status: 'running', animations: {}, motionJobIds: { 0: jobId } });
    await director.recover();
    await director.decide(proposal.id, decision(proposal, body.project));
    await vi.waitFor(async () => expect((await director.get(proposal.id)).status).toBe('ready'));
    expect(create).toHaveBeenCalledExactlyOnceWith(body.project, { id: jobId, prompt: 'Wave', duration: 2 });
  });
});
