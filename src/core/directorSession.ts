import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { api } from './api';
import { studio } from './store';
import { uid } from './project';
import { sceneSignature } from './proposals';
import { animationLibrary } from './animationLibrary';
import { prepareDirectorActions, directorSceneContext, explicitDirectorDecision, type DirectorContext, type DirectorExecution, type DirectorMessage, type DirectorProposal, type DirectorTurn } from './director';
import { captureDirectorFrame } from '../scene/directorCapture';
import { DirectorVoice, type VoiceEvent, type VoiceStatus } from './directorVoice';
import { DirectorSpeech, type DirectorSpeechStatus } from './directorSpeech';

interface ChatMessage extends DirectorMessage { id: string }
interface DirectorState { messages: ChatMessage[]; proposal: DirectorProposal | null; execution: DirectorExecution | null; busy: boolean; error: string; voice: VoiceStatus; speech: DirectorSpeechStatus; needsReview: boolean }
const RECOVERY = 'composition-director-execution';
export class DirectorSession {
  readonly id: string;
  private state: DirectorState = { messages: [], proposal: null, execution: null, busy: false, error: '', voice: 'off', speech: 'idle', needsReview: false };
  private listeners = new Set<() => void>();
  private voice?: DirectorVoice;
  private speech: DirectorSpeech;
  private speechEnabled = false;
  private voiceEpoch = 0;
  private voiceInputRevision = 0;
  private requestRevision = 0;
  private abort?: AbortController;
  private poll?: ReturnType<typeof setTimeout>;
  private active = false;
  private autoApply = false;
  private savedAssets = new Set<string>();
  private applied = new Set<string>();
  private cancelledTools = new Set<string>();
  private voiceApprovals = new Map<number, { proposalId?: string; revision?: number; consumed: boolean }>();
  private pendingTool?: string;
  constructor(readonly projectId: string) {
    this.speech = new DirectorSpeech(status => {
      this.voice?.setInputLocked(status !== 'idle'); this.update({ speech: status });
    }, error => this.update({ error }));
    let recovery: { sessionId?: string; projectId?: string; executionId?: string } | undefined;
    try { recovery = JSON.parse(localStorage.getItem(RECOVERY) ?? 'null'); } catch { /* Storage is optional. */ }
    this.id = recovery?.projectId === projectId && typeof recovery.sessionId === 'string' ? recovery.sessionId : uid();
    if (recovery?.projectId === projectId && typeof recovery.executionId === 'string') {
      void api.directorExecution(recovery.executionId).then(result => {
        if (this.requestRevision || this.state.proposal || this.state.execution) return;
        if (result.proposal.projectId !== this.projectId || result.proposal.sessionId !== this.id || ['applied', 'cancelled'].includes(result.status)) return;
        this.autoApply = false;
        this.update({ proposal: result.proposal, execution: result, needsReview: true }); this.message('assistant', 'Recovered a director request. Review it before applying; no changes were replayed.'); this.watch();
      }).catch(() => {});
    }
  }
  get = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<DirectorState>) {
    if (Object.entries(patch).every(([key, value]) => this.state[key as keyof DirectorState] === value)) return;
    this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener());
  }
  private message(role: DirectorMessage['role'], text: string) { this.update({ messages: [...this.state.messages, { id: uid(), role, text }].slice(-100) }); }
  private reply(text: string, speak = true, demoFallback = false) {
    this.message('assistant', text);
    if (!speak) return;
    if (this.speechEnabled) this.speech.enqueue(text);
    else if (demoFallback) this.voice?.cachedReply(text);
  }
  setSpeechEnabled = (enabled: boolean) => {
    this.speechEnabled = enabled;
    if (enabled) this.speech.resume(); else this.speech.stop();
  };
  clearError = () => this.update({ error: '' });
  clear = () => {
    if (this.state.busy) return;
    const proposal = this.state.proposal;
    if (proposal && !['applied', 'cancelled'].includes(proposal.status) && this.active && studio.get().project.id === this.projectId) {
      void api.directorDecision(proposal, 'cancel', studio.get().project).catch(() => { /* Clearing local chat must still work if the server is unavailable. */ });
    }
    this.stopVoice(); this.abort?.abort(); this.abort = undefined; clearTimeout(this.poll); this.poll = undefined;
    this.requestRevision++; this.voiceInputRevision++; this.autoApply = false; this.pendingTool = undefined;
    this.cancelledTools.clear(); this.voiceApprovals.clear();
    try { localStorage.removeItem(RECOVERY); } catch { /* Recovery storage is optional. */ }
    studio.patch({ preview: null, directorPreviewPlacement: null, directorPicking: false });
    this.update({ messages: [], proposal: null, execution: null, busy: false, error: '', voice: 'off', speech: 'idle', needsReview: false });
  };
  checkProgress = async () => {
    const expected = this.state.execution; if (!expected) return;
    try { const result = await api.directorExecution(expected.id); if (this.state.execution !== expected) return; this.autoApply = false; this.update({ execution: result, proposal: result.proposal, error: '', needsReview: true }); this.watch(); }
    catch (error) { if (this.state.execution === expected) this.update({ error: (error as Error).message }); }
  };
  setActive(active: boolean) {
    this.active = active;
    if (!active) { this.stopVoice(); this.autoApply = false; this.abort?.abort(); clearTimeout(this.poll); this.update({ busy: false }); }
    else this.watch();
  }
  private current() {
    const current = studio.get();
    if (!this.active || current.project.id !== this.projectId) throw new Error('Return to this project to continue with its director.');
    return current;
  }
  private context(): DirectorContext {
    const current = this.current();
    return { objectId: current.selectionActive ? current.objectId : null, clipId: current.selectedClip, time: current.time, placement: current.directorPlacement };
  }
  private input(text: string) {
    const current = this.current(), frame = captureDirectorFrame();
    return { sessionId: this.id, project: current.project, context: { ...this.context(), view: frame.view }, messages: this.state.messages.slice(-30).map(({ role, text }) => ({ role, text: text.slice(0, 4000) })), text, image: frame.image, ...(this.state.execution?.status === 'running' ? { executionId: this.state.execution.id } : {}) };
  }
  private voiceContext() {
    const current = this.current(), scene = directorSceneContext(current.project, this.context());
    return JSON.stringify({ scene: { ...scene, objects: scene.objects.map(({ geometry: _geometry, ...object }) => object) }, proposal: this.state.proposal ? { id: this.state.proposal.id, revision: this.state.proposal.revision, summary: this.state.proposal.summary, status: this.state.proposal.status } : null, execution: this.state.execution?.status ?? null });
  }
  private voiceUpdate(withImage = false) {
    if (!this.voice || !this.active) return;
    try { this.voice.send({ type: 'context', context: this.voiceContext(), ...(withImage ? { image: captureDirectorFrame().image } : {}) }); } catch { /* A capture can be temporarily unavailable during editing. */ }
  }
  async send(text: string) {
    const clean = text.trim(); if (!clean || this.state.busy) return;
    if (this.state.speech !== 'idle') { this.update({ error: 'Wait for Director to finish speaking before sending another message.' }); return; }
    if (this.state.voice !== 'off') {
      this.voiceInputRevision++;
      if (!this.voice?.send({ type: 'text', text: clean })) this.update({ error: 'Voice is connecting. Wait a moment, or stop voice to type.' });
      else this.message('user', clean);
      return;
    }
    this.message('user', clean);
    const decision = explicitDirectorDecision(clean);
    if (decision && this.state.proposal) { await this.decide(decision); return; }
    await this.plan(clean);
  }
  private async plan(text: string): Promise<DirectorTurn> {
    if (this.state.busy) throw new Error('Wait for the current director response before sending another request.');
    this.requestRevision++;
    this.update({ busy: true, error: '' }); const controller = new AbortController(); this.abort = controller;
    try {
      const result = await api.directorTurn(this.input(text), controller.signal);
      if (controller.signal.aborted || !this.active || studio.get().project.id !== this.projectId) return { message: 'Request stopped.' };
      if (result.proposal) { studio.patch({ preview: null }); this.update({ proposal: result.proposal, execution: null, needsReview: false }); }
      this.reply(result.message, !this.voice || result.source === 'demo-cache', result.source === 'demo-cache');
      this.voiceUpdate(); return result;
    } catch (error) {
      if (controller.signal.aborted) return { message: 'Request stopped.' };
      this.update({ error: (error as Error).message }); throw error;
    } finally { if (this.abort === controller) { this.abort = undefined; this.update({ busy: false }); this.watch(); } }
  }
  private remember(result: DirectorExecution) {
    try {
      if (['applied', 'cancelled'].includes(result.status)) localStorage.removeItem(RECOVERY);
      else localStorage.setItem(RECOVERY, JSON.stringify({ projectId: this.projectId, sessionId: this.id, executionId: result.id }));
    } catch { /* Project persistence still works independently. */ }
  }
  async decide(decision: 'approve' | 'cancel' | 'refresh', stillAuthorized: () => boolean = () => true) {
    const proposal = this.state.proposal; if (!proposal || this.state.busy) return;
    if (!stillAuthorized()) return;
    this.requestRevision++;
    if (decision === 'approve' && (this.state.needsReview || proposal.baseSignature !== sceneSignature(this.current().project))) { await this.decide('refresh'); return; }
    this.update({ busy: true, error: '' });
    try {
      const project = this.current().project;
      let result = await api.directorDecision(proposal, decision, project);
      if (!stillAuthorized() && decision === 'approve') {
        this.autoApply = false;
        result = await api.directorDecision(result.proposal, 'cancel', project);
      }
      if (!this.active || studio.get().project.id !== this.projectId) { this.autoApply = false; return; }
      this.autoApply = decision === 'approve' && stillAuthorized() && result.status !== 'cancelled'; this.remember(result);
      this.update({ proposal: result.proposal, execution: result, needsReview: false });
      const speak = !this.voice || proposal.source === 'demo-cache';
      const demoFallback = proposal.source === 'demo-cache';
      if (result.status === 'cancelled') { studio.patch({ preview: null }); const reply = 'Cancelled. Your scene has not changed.'; this.reply(reply, speak, demoFallback); }
      else if (decision === 'refresh') { studio.patch({ preview: null }); const reply = 'I refreshed the proposal for the current scene. Review the preview, then approve this version.'; this.reply(reply, speak, demoFallback); }
      else this.reply(result.status === 'running' ? 'Preparing your approved changes. You can keep editing.' : 'Your approved changes are ready.', speak, demoFallback);
      this.voiceUpdate();
    } catch (error) { this.autoApply = false; this.update({ error: (error as Error).message }); }
    finally { this.update({ busy: false }); this.watch(); }
  }
  preview = () => {
    try {
      const current = this.current(), proposal = this.state.proposal;
      if (!proposal || proposal.baseSignature !== sceneSignature(current.project)) throw new Error('The scene changed. Refresh the proposal first.');
      const { project: preview, placement } = prepareDirectorActions(current.project, proposal.actions, this.state.execution?.animations);
      studio.patch({ preview, directorPreviewPlacement: placement ?? null, playing: false, selectionActive: false }); this.update({ error: '' });
    } catch (error) { this.update({ error: (error as Error).message }); }
  };
  private watch() {
    clearTimeout(this.poll);
    if (!this.active || !this.state.execution || this.state.busy) return;
    const execution = this.state.execution;
    for (const asset of Object.values(execution.animations)) if (!this.savedAssets.has(asset.id)) { try { animationLibrary.save(asset); this.savedAssets.add(asset.id); } catch { /* Application can still proceed if the library is full. */ } }
    if (execution.status === 'running') {
      this.poll = setTimeout(() => { void api.directorExecution(execution.id).then(result => {
        if (this.state.execution !== execution || !this.active) return;
        this.update({ execution: result, proposal: result.proposal }); this.remember(result); this.watch();
      }).catch(error => { if (this.state.execution !== execution || !this.active) return; this.autoApply = false; this.update({ error: error.message, needsReview: true }); }); }, 1200);
    } else if (execution.status === 'ready') {
      if (!this.autoApply || execution.proposal.status !== 'approved' || this.applied.has(execution.id)) return;
      if (execution.proposal.baseSignature !== sceneSignature(studio.get().project)) {
        this.autoApply = false; this.update({ needsReview: true }); this.message('assistant', 'The scene changed while I prepared this. Refresh and review the proposal before applying. Your generated motion is kept.'); this.voiceUpdate(); return;
      }
      if (document.hidden || studio.directorBusy()) { this.poll = setTimeout(() => this.watch(), 500); return; }
      try {
        studio.applyDirector(execution); this.applied.add(execution.id); this.autoApply = false;
        const applied: DirectorExecution = { ...execution, status: 'applied', proposal: { ...execution.proposal, status: 'applied' } };
        this.update({ execution: applied, proposal: applied.proposal }); this.remember(applied);
        const reply = execution.proposal.actions.every(action => action.kind === 'set_placement') ? 'Marker placed. Tell me what you want to put here.' : 'Applied. You can adjust the result in the scene or use Undo.';
        this.reply(reply, !this.voice || execution.proposal.source === 'demo-cache', execution.proposal.source === 'demo-cache'); this.voiceUpdate(true);
        void api.directorDecision(execution.proposal, 'applied', studio.get().project).catch(() => { /* Local ledger prevents replay; a recovered result always needs review. */ });
      } catch (error) { this.autoApply = false; this.update({ error: (error as Error).message, needsReview: true }); }
    } else if (execution.status === 'failed') { this.autoApply = false; this.update({ error: execution.error ?? 'Preparation failed. Retry or revise the request.' }); this.voiceUpdate(); }
  }
  async startVoice() {
    if (this.state.voice !== 'off') return;
    try {
      const frame = captureDirectorFrame(); this.speech.resume(); this.update({ error: '' }); this.cancelledTools.clear(); this.voiceApprovals.clear(); const epoch = ++this.voiceEpoch;
      const voice = new DirectorVoice(event => { if (epoch === this.voiceEpoch) void this.voiceEvent(event).catch(error => this.update({ error: error.message })); }, status => { if (epoch === this.voiceEpoch) this.update({ voice: status }); }, error => { this.autoApply = false; this.update({ error, needsReview: !!this.state.execution }); });
      this.voice = voice;
      await voice.start({ sessionId: this.id, context: this.voiceContext(), image: frame.image, demo: studio.get().project.demo, messages: this.state.messages.slice(-30).map(({ role, text }) => ({ role, text: text.slice(0, 4000) })) });
    } catch (error) { this.update({ error: (error as Error).message, voice: 'off' }); }
  }
  stopVoice = () => { this.voice?.stop(); this.voice = undefined; this.speech.stop(); if (this.speechEnabled) this.speech.resume(); this.voiceEpoch++; this.update({ voice: 'off', speech: 'idle' }); };
  private async voiceEvent(event: VoiceEvent) {
    if (event.type === 'speech-start') { this.voiceInputRevision++; this.voiceUpdate(true); return; }
    if (event.type === 'input-start' && typeof event.turn === 'number' && Number.isInteger(event.turn)) {
      const proposal = this.state.proposal;
      this.voiceApprovals.set(event.turn, { proposalId: proposal?.id, revision: proposal?.revision, consumed: false });
      if (this.voiceApprovals.size > 32) this.voiceApprovals.delete(this.voiceApprovals.keys().next().value!);
      return;
    }
    if (event.type === 'reconnecting') { this.autoApply = false; if (this.state.execution) this.update({ needsReview: true }); return; }
    if (event.type === 'transcript' && (event.role === 'user' || event.role === 'assistant') && typeof event.text === 'string') {
      const id = `voice-${this.voiceEpoch}-${event.role}-${event.turn}`;
      const message: ChatMessage = { id, role: event.role, text: event.text };
      this.update({ messages: this.state.messages.some(m => m.id === id) ? this.state.messages.map(m => m.id === id ? message : m) : [...this.state.messages, message].slice(-100) }); return;
    }
    if (event.type === 'turn-complete' && typeof event.text === 'string') {
      if (this.speechEnabled) this.speech.enqueue(event.text); return;
    }
    if (event.type === 'tool-cancelled' && typeof event.id === 'string') {
      this.cancelledTools.add(event.id);
      if (this.pendingTool === event.id) { this.abort?.abort(); this.autoApply = false; }
      return;
    }
    if (event.type !== 'tool' || typeof event.id !== 'string' || typeof event.name !== 'string' || this.cancelledTools.has(event.id)) return;
    const voice = this.voice; this.pendingTool = event.id;
    const toolId = event.id, inputRevision = this.voiceInputRevision;
    const authorized = () => !this.cancelledTools.has(toolId) && voice === this.voice && inputRevision === this.voiceInputRevision;
    let result: unknown;
    try {
      if (event.name === 'director_request') {
        const args = z.object({ request: z.string().trim().min(1).max(4000) }).parse(event.args);
        result = await this.plan(args.request);
      } else if (event.name === 'director_decision') {
        const args = z.object({ decision: z.enum(['approve', 'cancel']), proposalId: z.string(), revision: z.number().int() }).parse(event.args);
        const proposal = this.state.proposal;
        const approval = typeof event.turn === 'number' ? this.voiceApprovals.get(event.turn) : undefined;
        if (explicitDirectorDecision(String(event.utterance ?? '')) !== args.decision || !proposal || args.proposalId !== proposal.id || args.revision !== proposal.revision || !approval || approval.consumed || approval.proposalId !== args.proposalId || approval.revision !== args.revision) throw new Error('Ask for a clear yes or cancel for the current proposal. No change was authorized.');
        approval.consumed = true;
        await this.decide(args.decision, authorized);
        result = { status: this.state.execution?.status, proposal: this.state.proposal, error: this.state.error || undefined };
      } else if (event.name === 'director_status') result = this.voiceContext();
      else throw new Error('Unsupported director tool.');
    } catch (error) { result = { error: (error as Error).message }; }
    finally { if (this.pendingTool === event.id) this.pendingTool = undefined; }
    if (!this.cancelledTools.has(event.id) && voice === this.voice) {
      // Geometry and baked keyframes stay in the editor, not the audio context.
      const value = result as DirectorTurn;
      if (value?.proposal) result = { ...value, proposal: { id: value.proposal.id, revision: value.proposal.revision, summary: value.proposal.summary, status: value.proposal.status } };
      voice?.send({ type: 'tool-result', id: event.id, result: JSON.stringify(result) });
    }
  }
}
const sessions = new Map<string, DirectorSession>();
export function directorSession(projectId: string) { let session = sessions.get(projectId); if (!session) { session = new DirectorSession(projectId); sessions.set(projectId, session); } return session; }
export function useDirector(session: DirectorSession) { return useSyncExternalStore(session.subscribe, session.get); }
