import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CornerDownLeft, LoaderCircle, MapPin, Mic, MicOff, Minus, Play, RefreshCw, Send, Sparkles, Undo2, X } from 'lucide-react';
import { studio, useStudio } from '../core/store';
import { directorSession, useDirector } from '../core/directorSession';
import { sceneSignature } from '../core/proposals';
import { api, type Capabilities } from '../core/api';
import './director.css';

export default function DirectorPanel({ open, active, onOpen, onClose }: { open: boolean; active: boolean; onOpen: () => void; onClose: () => void }) {
  const editor = useStudio(), session = useMemo(() => directorSession(editor.project.id), [editor.project.id]);
  const state = useDirector(session), [text, setText] = useState(''), [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const messages = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const update = () => session.setActive(active && !document.hidden);
    update(); document.addEventListener('visibilitychange', update);
    return () => { session.setActive(false); document.removeEventListener('visibilitychange', update); };
  }, [session, active]);
  useEffect(() => { if (editor.camera === 'ar') session.stopVoice(); }, [session, editor.camera]);
  useEffect(() => { if (open) { let live = true; api.capabilities().then(value => { if (live) setCapabilities(value); }).catch(() => {}); return () => { live = false; }; } }, [open]);
  useEffect(() => { messages.current?.scrollTo({ top: messages.current.scrollHeight }); }, [state.messages, state.proposal, open]);
  const proposal = state.proposal, execution = state.execution;
  const signature = useMemo(() => sceneSignature(editor.project), [editor.project]);
  const pending = proposal && !['applied', 'cancelled'].includes(proposal.status);
  const stale = pending && (state.needsReview || proposal.baseSignature !== signature);
  const working = execution?.status === 'running';
  const voiceOn = state.voice !== 'off';
  const canPreview = pending && !stale && !working && (!proposal.actions.some(action => action.kind === 'generate_motion') || !!Object.keys(execution?.animations ?? {}).length);
  async function send(value = text) {
    if (!value.trim()) return;
    setText('');
    try { await session.send(value); } catch { /* The session presents actionable errors. */ }
  }
  function pick() {
    studio.patch({ directorPicking: !editor.directorPicking, preview: null, playing: false, selectionActive: false, camera: 'orbit' });
  }
  if (!active) return null;
  if (!open) return voiceOn ? <div className="director-dock" role="region" aria-label="Director voice controls"><button onClick={onOpen}><span className={`director-voice-dot ${state.voice}`} /><Mic size={16} /><span>Director · {state.voice}</span></button><button aria-label="Stop director voice" onClick={session.stopVoice}><MicOff size={17} /></button></div> : null;
  return <aside className="assistant-panel director-panel" aria-label="Director">
    <div className="panel-heading"><div><span className="eyebrow"><Sparkles size={12} /> Gemini</span><h2>Director</h2></div><div className="director-heading-actions"><button className="icon-button" aria-label="Minimize director" onClick={onClose}><Minus size={18} /></button><button className="icon-button" aria-label="Close director" onClick={() => { session.stopVoice(); studio.patch({ preview: null, directorPicking: false }); onClose(); }}><X size={19} /></button></div></div>
    <div className="director-context"><button className={editor.directorPicking ? 'is-picking' : ''} onClick={pick} disabled={editor.exporting || editor.phoneControl || editor.camera === 'ar'}><MapPin size={14} />{editor.directorPicking ? 'Click the floor…' : editor.directorPlacement ? 'Placement point set' : 'Pick placement point'}</button>{editor.directorPlacement && <button aria-label="Clear placement point" onClick={() => studio.patch({ directorPlacement: null, directorPicking: false })}><X size={13} /></button>}</div>
    <div className="director-messages" ref={messages} role="log" aria-label="Director conversation" aria-live="polite">
      {!state.messages.length && <div className="director-welcome"><h3>What are we making?</h3><p>Build the scene, direct a performance, or find the right shot. I’ll check the plan with you before changing anything.</p><div className="director-examples">{['Add a desk here', 'Make the character wave', 'Frame the character with the camera'].map(prompt => <button key={prompt} onClick={() => { setText(prompt); input.current?.focus(); }}>{prompt}<CornerDownLeft size={13} /></button>)}</div></div>}
      {state.messages.map(message => <div key={message.id} className={`director-message ${message.role}`}><span>{message.role === 'assistant' ? 'Director' : 'You'}</span><p>{message.text}</p></div>)}
      {state.busy && <div className="director-thinking" role="status"><LoaderCircle size={15} /> Thinking through your scene…</div>}
    </div>
    {pending && <section className="director-proposal" aria-label="Director proposal"><div className="director-proposal-title"><span>{working ? <LoaderCircle size={15} /> : <Sparkles size={15} />}{working ? 'Preparing your changes' : stale ? 'Scene changed · review needed' : 'Ready for your approval'}</span><small>{proposal.actions.length} {proposal.actions.length === 1 ? 'action' : 'actions'}</small></div><p>{proposal.summary}</p>
      {working && <small>Keep editing while motion generates. It will only apply if the scene still matches.</small>}
      <div className="director-proposal-actions">
        {!working && <button className="button primary" disabled={state.busy || studio.directorBusy()} onClick={() => void session.decide(stale ? 'refresh' : 'approve')}>{stale ? <RefreshCw size={14} /> : <Check size={14} />}{stale ? 'Refresh & review' : execution?.status === 'failed' ? 'Retry preparation' : 'Apply'}</button>}
        {canPreview && <button className="button secondary" disabled={state.busy} onClick={() => editor.preview ? studio.patch({ preview: null }) : session.preview()}><Play size={13} />{editor.preview ? 'End preview' : 'Preview'}</button>}
        {!working && <button className="button secondary" disabled={state.busy} onClick={() => { input.current?.focus(); setText('Change the plan: '); }}>Revise</button>}
        <button className="button secondary" disabled={state.busy} onClick={() => void session.decide('cancel')}>Cancel</button>
      </div>
    </section>}
    {execution?.status === 'applied' && <div className="director-applied"><span><Check size={14} />{execution.proposal.actions.every(action => action.kind === 'set_placement') ? 'Marker placed' : 'Changes applied'}</span>{execution.proposal.actions.some(action => action.kind !== 'set_placement') && <button disabled={!editor.undoCount} onClick={studio.undo}><Undo2 size={14} /> Undo</button>}</div>}
    {state.error && <div className="director-error" role="alert"><div><p>{state.error}</p>{working && <button className="director-retry" onClick={() => void session.checkProgress()}>Check progress again</button>}</div><button aria-label="Dismiss director error" onClick={session.clearError}><X size={14} /></button></div>}
    {capabilities && !capabilities.director && <p className="director-config" role="status">Director needs a Gemini connection. Set GEMINI_API_KEY on the local server, then restart it.</p>}
    <form className="director-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <textarea ref={input} aria-label="Message director" placeholder="Tell the director what you have in mind…" value={text} maxLength={4000} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} disabled={state.busy} rows={2} />
      <div className="director-composer-actions"><button type="button" className={`director-mic ${voiceOn ? 'is-on' : ''}`} aria-label={voiceOn ? 'Stop director voice' : 'Start director voice'} aria-pressed={voiceOn} disabled={!voiceOn && capabilities?.directorVoice === false} onClick={() => voiceOn ? session.stopVoice() : void session.startVoice()}>{voiceOn ? <MicOff size={17} /> : <Mic size={17} />}<span>{voiceOn ? state.voice : 'Talk to Director'}</span></button><button type="submit" className="director-send" aria-label="Send to director" disabled={!text.trim() || state.busy || capabilities?.director === false}><Send size={16} /></button></div>
    </form>
  </aside>;
}
