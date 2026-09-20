import { z } from 'zod';
import { applyDirectorActions, directorInputSchema, directorResponseSchema, rebaseMotion, type DirectorExecution, type DirectorInput, type DirectorProposal, type DirectorTurn } from '../src/core/director';
import { parseProject, uid, type Project } from '../src/core/project';
import { sceneSignature } from '../src/core/proposals';
import { AppError, type FileStore } from './storage';
import type { Providers } from './providers';
import type { MotionJobs } from './motionJobs';
import type { MotionJob } from '../src/core/api';

interface ExecutionRecord extends DirectorExecution { project: Project; motionJobIds: Record<string, string> }
export const directorDecisionSchema = z.object({ sessionId: z.string().max(80), revision: z.number().int().positive(), decision: z.enum(['approve', 'cancel', 'applied', 'refresh']), project: z.unknown() }).strict();
export class Director {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private store: FileStore, private providers: Providers, private motion: Pick<MotionJobs, 'create' | 'get'>) {}
  private async exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(key) ?? Promise.resolve()).catch(() => {}).then(fn); this.locks.set(key, next);
    try { return await next; } finally { if (this.locks.get(key) === next) this.locks.delete(key); }
  }
  async recover() {
    for (const record of await this.store.list<ExecutionRecord>('director-executions')) {
      if (record.status === 'running') await this.store.put('director-executions', record.id, { ...record, status: 'failed', error: 'The server restarted during preparation. Review the request and retry; nothing was applied.' });
    }
  }
  async turn(raw: unknown): Promise<DirectorTurn> {
    const parsed = directorInputSchema.parse(raw), input: DirectorInput = { ...parsed, project: parseProject(JSON.stringify(parsed.project)) };
    if (!this.providers.configured.gemini) throw new AppError(503, 'GEMINI_NOT_CONFIGURED', 'Configure GEMINI_API_KEY on the server to use Director.');
    return this.exclusive(input.sessionId, async () => {
      const active = input.executionId ? await this.get(input.executionId) : undefined;
      if (active && (active.proposal.projectId !== input.project.id || active.proposal.sessionId !== input.sessionId)) throw new AppError(409, 'DIRECTOR_SESSION_CHANGED', 'This execution belongs to another conversation.');
      const result = directorResponseSchema.parse(await this.providers.director(input));
      if (result.kind === 'message') return { message: result.message };
      if (active?.status === 'running') return { message: 'I am still preparing your approved request. You can keep editing and talking with me. Cancel that request before starting another scene change.' };
      try { applyDirectorActions(input.project, result.actions, {}, true); }
      catch (error) { return { message: `I need to adjust that plan before applying it. ${(error as Error).message}` }; }
      // These are server asset IDs, not model-provided URLs or arbitrary files.
      for (const action of result.actions) if (action.kind === 'create_object') await Promise.all(action.spec.referenceAssetIds.map(id => this.store.requireAsset(id, 'reference')));
      for (const prior of await this.store.list<DirectorProposal>('director-proposals')) if (prior.sessionId === input.sessionId && prior.status === 'pending') await this.store.put('director-proposals', prior.id, { ...prior, status: 'cancelled' });
      const proposal: DirectorProposal = { id: uid(), sessionId: input.sessionId, projectId: input.project.id, revision: 1, baseSignature: sceneSignature(input.project), summary: result.message, actions: result.actions, status: 'pending' };
      await this.store.put('director-proposals', proposal.id, proposal);
      return { message: result.message, proposal };
    });
  }
  async get(id: string): Promise<DirectorExecution> {
    const { project: _project, motionJobIds: _jobs, ...result } = await this.store.get<ExecutionRecord>('director-executions', id); return result;
  }
  async proposal(id: string) { return this.store.get<DirectorProposal>('director-proposals', id); }
  async decide(id: string, raw: unknown): Promise<DirectorExecution> {
    const input = directorDecisionSchema.parse(raw), project = parseProject(JSON.stringify(input.project));
    return this.exclusive(id, async () => {
      const proposal = await this.proposal(id);
      if (proposal.sessionId !== input.sessionId || proposal.projectId !== project.id) throw new AppError(409, 'DIRECTOR_SESSION_CHANGED', 'Return to the project and conversation that created this proposal.');
      if (proposal.revision !== input.revision) throw new AppError(409, 'DIRECTOR_REVISION_CHANGED', 'This proposal was revised. Review the latest version before approving.');
      let existing: ExecutionRecord | undefined;
      try { existing = await this.store.get<ExecutionRecord>('director-executions', id); }
      catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
      if (proposal.status === 'applied') return this.get(id);
      if (proposal.status === 'cancelled') throw new AppError(409, 'DIRECTOR_CANCELLED', 'This proposal was cancelled. Ask for a new plan.');
      if (input.decision === 'cancel') {
        const record: ExecutionRecord = { id, project, proposal: { ...proposal, status: 'cancelled' }, animations: existing?.animations ?? {}, motionJobIds: existing?.motionJobIds ?? {}, status: 'cancelled' };
        await this.store.put('director-proposals', id, record.proposal); await this.store.put('director-executions', id, record); return this.get(id);
      }
      if (input.decision === 'applied') {
        if (existing?.status !== 'ready') throw new AppError(409, 'DIRECTOR_NOT_READY', 'The result is not ready to apply.');
        existing.proposal.status = 'applied'; existing.status = 'applied';
        await this.store.put('director-proposals', id, existing.proposal); await this.store.put('director-executions', id, existing); return this.get(id);
      }
      if (input.decision === 'refresh') {
        if (existing?.status === 'running') throw new AppError(409, 'DIRECTOR_BUSY', 'Wait for preparation to finish before refreshing the preview.');
        const animations = existing?.animations ?? {};
        proposal.actions.forEach((action, index) => {
          if (action.kind === 'generate_motion' && animations[index]) {
            const before = applyDirectorActions(project, proposal.actions.slice(0, index), animations, true);
            animations[index] = rebaseMotion(animations[index], before, action.start);
          }
        });
        try { applyDirectorActions(project, proposal.actions, animations, true); }
        catch (error) { throw new AppError(409, 'DIRECTOR_CONFLICT', `${(error as Error).message} Revise the request; the completed motion remains available.`); }
        proposal.baseSignature = sceneSignature(project); proposal.revision++; proposal.status = 'pending';
        const record: ExecutionRecord = { id, project, proposal, animations, status: 'ready', motionJobIds: existing?.motionJobIds ?? {} };
        await this.store.put('director-proposals', id, proposal); await this.store.put('director-executions', id, record); return this.get(id);
      }
      if (sceneSignature(project) !== proposal.baseSignature) throw new AppError(409, 'DIRECTOR_STALE', 'The scene changed. Refresh and review the proposal before approving.');
      if (existing && proposal.status === 'approved' && ['running', 'ready'].includes(existing.status)) return this.get(id);
      if (proposal.actions.some(a => a.kind === 'generate_motion') && !this.providers.configured.hunyuanMotion) throw new AppError(503, 'HUNYUAN_MOTION_NOT_CONFIGURED', 'Configure FAL_KEY to generate humanoid motion.');
      applyDirectorActions(project, proposal.actions, existing?.animations, true);
      const record: ExecutionRecord = { id, project, proposal: { ...proposal, status: 'approved' }, status: 'running', animations: existing?.animations ?? {}, motionJobIds: existing?.motionJobIds ?? {} };
      await this.store.put('director-proposals', id, record.proposal); await this.store.put('director-executions', id, record);
      void this.execute(record).catch(() => { /* The persisted job remains recoverable if disk writing fails. */ });
      return this.get(id);
    });
  }
  private async execute(record: ExecutionRecord) {
    try {
      for (const [index, action] of record.proposal.actions.entries()) {
        if (action.kind !== 'generate_motion' || record.animations[index]) continue;
        if ((await this.get(record.id)).status === 'cancelled') return;
        const before = applyDirectorActions(record.project, record.proposal.actions.slice(0, index), record.animations);
        let jobId: string | undefined = record.motionJobIds[index];
        // A failed provider job gets a fresh ID only after an explicit retry.
        if (jobId) {
          try { if ((await this.motion.get(jobId)).status === 'failed') jobId = undefined; }
          catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
        }
        jobId ||= uid(); record.motionJobIds[index] = jobId;
        const cancelled = await this.exclusive(record.id, async () => {
          if ((await this.get(record.id)).status === 'cancelled') return true;
          await this.store.put('director-executions', record.id, record); return false;
        });
        if (cancelled) return;
        let job: MotionJob = await this.motion.create(before, { id: jobId, prompt: action.prompt, duration: action.duration });
        while (job.status === 'running') {
          await new Promise(resolve => setTimeout(resolve, 1500));
          if ((await this.get(record.id)).status === 'cancelled') return;
          job = await this.motion.get(jobId);
        }
        if (job.status === 'failed' || !job.animation) throw new Error(job.error ?? 'Motion generation returned no animation.');
        record.animations[index] = rebaseMotion(job.animation, before, action.start);
      }
      applyDirectorActions(record.project, record.proposal.actions, record.animations);
      record.status = 'ready';
    } catch (error) { record.status = 'failed'; record.error = error instanceof Error ? error.message : 'The director could not prepare this request.'; }
    await this.exclusive(record.id, async () => {
      if ((await this.get(record.id)).status !== 'cancelled') await this.store.put('director-executions', record.id, record);
    });
  }
}
