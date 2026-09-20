import express from 'express';
import path from 'node:path';
import { z } from 'zod';
import { parseProject, uid, validId } from '../src/core/project';
import { applyProposal, objectSpecSchema } from '../src/core/proposals';
import { projectPreview } from '../src/core/projectPreview';
import { FileStore, AppError, type ProjectRecord } from './storage';
import { firstFrame, lastFrame, imageMime, saveGuide, videoExportAvailable } from './media';
import { liveProviders, type Providers } from './providers';
import { Jobs } from './jobs';
import { ImageJobs } from './imageJobs';
import { MotionJobs } from './motionJobs';
import type { ImageJob, SavedObject } from '../src/core/api';
import type { PhoneRelay } from './phoneRelay';
import { promptTargetSchema } from '../src/core/outputPrompts';

export async function createApp(options: { dataDir?: string; providers?: (store: FileStore) => Providers; phone?: PhoneRelay } = {}) {
  const store = new FileStore(path.resolve(options.dataDir ?? process.env.DATA_DIR ?? 'data/studio')); await store.init();
  const providers = options.providers?.(store) ?? liveProviders(store), jobs = new Jobs(store, providers); await jobs.recover();
  const imageJobs = new ImageJobs(store, providers); await imageJobs.recover();
  const motionJobs = new MotionJobs(store, providers); await motionJobs.recover();
  const app = express(); app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    const allowed = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173', `http://127.0.0.1:${process.env.PORT || 3001}`, `http://localhost:${process.env.PORT || 3001}`, process.env.APP_ORIGIN].filter(Boolean));
    if (origin && !allowed.has(origin)) return next(new AppError(403, 'ORIGIN_REJECTED', 'This origin is not allowed to access the local studio server.'));
    next();
  });
  app.get('/api/capabilities', (_req, res) => res.json({ ...providers.configured, videoExport: videoExportAvailable }));
  app.get('/api/phone', (_req, res) => res.json({ enabled: !!options.phone }));
  options.phone?.routes(app);
  app.post('/api/assets', express.raw({ type: ['image/*', 'video/*'], limit: '50mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new AppError(400, 'EMPTY_ASSET', 'Upload an image or guide video.');
    if (req.query.role === 'guide') return res.status(201).json(await saveGuide(store, req.body, Number(req.query.duration)));
    if (req.query.role !== 'reference' || req.body.length > 30_000_000) throw new AppError(400, 'INVALID_ASSET', 'Reference images must be under 30 MB.');
    res.status(201).json(await store.asset(req.body, imageMime(req.body), 'reference'));
  });
  app.get('/api/assets/:id/file', async (req, res) => {
    const asset = await store.requireAsset(req.params.id);
    const extension = asset.mimeType.split('/')[1].replace('jpeg', 'jpg');
    res.setHeader('Content-Type', asset.mimeType); res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${asset.role}-${asset.id.slice(0, 10)}.${extension}"`);
    res.sendFile(store.file('assets', asset.id, 'bin'));
  });
  app.get('/api/assets/:id', async (req, res) => res.json(await store.requireAsset(req.params.id)));
  app.get('/api/assets/:id/first-frame', async (req, res) => res.json(await firstFrame(store, req.params.id)));
  app.get('/api/assets/:id/last-frame', async (req, res) => res.json(await lastFrame(store, req.params.id)));
  app.use(express.json({ limit: '8mb' }));
  app.post('/api/output-prompts', async (req, res) => {
    const input = z.object({ project: z.unknown(), target: promptTargetSchema, prompt: z.string().trim().min(1).max(4000), previous: z.string().max(4000).optional() }).strict().parse(req.body);
    res.json(await providers.refinePrompt(parseProject(JSON.stringify(input.project)), input.target, input.prompt, input.previous));
  });
  app.get('/api/projects', async (_req, res) => res.json((await store.list<ProjectRecord>('projects')).map(({ project, updatedAt }) => ({
    id: project.id, name: project.name, updatedAt, duration: project.duration,
    objectCount: project.objects.filter(object => !object.hidden).length,
    hasMotion: project.tracks.some(track => track.keys.length > 0) || !!project.clips?.length,
    preview: projectPreview(project),
  })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
  app.get('/api/projects/:id', async (req, res) => res.json((await store.get<ProjectRecord>('projects', req.params.id)).project));
  app.delete('/api/projects/:id', async (req, res) => {
    await store.remove('projects', req.params.id);
    res.status(204).end();
  });
  app.put('/api/projects/:id', async (req, res) => {
    const project = parseProject(JSON.stringify(req.body));
    if (project.id !== req.params.id) throw new AppError(400, 'PROJECT_ID', 'Project ID does not match the saved scene.');
    await store.references(project); await store.put('projects', project.id, { project, updatedAt: new Date().toISOString() }); res.json(project);
  });
  app.get('/api/objects', async (_req, res) => res.json(await store.list<SavedObject>('objects')));
  app.post('/api/objects', async (req, res) => {
    const object = objectSpecSchema.parse(req.body); await Promise.all(object.referenceAssetIds.map(id => store.requireAsset(id, 'reference')));
    const record: SavedObject = { id: uid(), object, createdAt: new Date().toISOString() }; await store.put('objects', record.id, record); res.status(201).json(record);
  });
  app.post('/api/proposals', async (req, res) => {
    const input = z.object({ kind: z.enum(['object', 'composition', 'movement']), prompt: z.string().trim().min(1).max(4000), project: z.unknown(), objectId: z.string().max(80), mode: z.literal('live') }).strict().parse(req.body);
    const project = parseProject(JSON.stringify(input.project));
    const proposal = await providers.propose(project, input.kind, input.prompt, input.objectId);
    applyProposal(project, proposal);
    if (proposal.content.kind === 'object') await Promise.all(proposal.content.object.referenceAssetIds.map(id => store.requireAsset(id, 'reference')));
    await store.put('proposals', proposal.id, proposal); res.status(201).json(proposal);
  });
  app.post('/api/jobs', async (req, res) => {
    const input = z.object({ id: z.string().refine(validId), prompt: z.string().trim().min(1).max(4000), project: z.unknown(), mode: z.literal('live') }).strict().parse(req.body);
    res.status(202).json(await jobs.create(input.id, parseProject(JSON.stringify(input.project)), input.prompt));
  });
  app.get('/api/jobs/:id', async (req, res) => res.json(await jobs.refresh(req.params.id)));
  app.post('/api/image-jobs', async (req, res) => {
    const { projectId, ...input } = z.object({ id: z.string().refine(validId), projectId: z.string().refine(validId), prompt: z.string().trim().min(1).max(4000), guideAssetId: z.string().refine(validId).optional(), count: z.number().int().positive().optional(), paired: z.boolean().optional(), referenceAssetIds: z.array(z.string().refine(validId)).optional() }).strict().parse(req.body);
    res.status(202).json(await imageJobs.create(projectId, input));
  });
  app.get('/api/image-jobs/:id', async (req, res) => res.json(await store.get<ImageJob>('image-jobs', req.params.id)));
  app.post('/api/motion-jobs', async (req, res) => {
    const input = z.object({ id: z.string().refine(validId), prompt: z.string().trim().min(1).max(4000), duration: z.number().finite().min(.5).max(10), project: z.unknown() }).strict().parse(req.body);
    res.status(202).json(await motionJobs.create(parseProject(JSON.stringify(input.project)), input));
  });
  app.get('/api/motion-jobs/:id', async (req, res) => res.json(await motionJobs.get(req.params.id)));
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Unknown API endpoint.')));
  app.use(express.static(path.resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof AppError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error instanceof z.ZodError) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid request values. Check the input and try again.', details: error.issues.map(i => ({ path: i.path, message: i.message })) } });
    if (error instanceof SyntaxError || error instanceof Error && /Invalid|Unsupported|compatible|Duplicate/.test(error.message)) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: error.message.slice(0, 240) } });
    if ((error as { status?: number }).status === 413) return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'This upload exceeds the size limit.' } });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'The server could not complete this request. Your scene has not changed.' } });
  });
  return { app, store, jobs, motionJobs };
}
