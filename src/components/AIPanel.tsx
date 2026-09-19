import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Film, Layers3, LoaderCircle, Play, WandSparkles, X } from 'lucide-react';
import { api, assetUrl, type MotionJob } from '../core/api';
import { studio, useStudio } from '../core/store';
import { applyProposal, proposalContentSchema, sceneSignature, type Proposal } from '../core/proposals';
import { animationFromTracks } from '../core/clips';
import { animationLibrary } from '../core/animationLibrary';
import { uid } from '../core/project';

type Mode = 'object' | 'motion' | 'redefine';
const copy: Record<Mode, { title: string; placeholder: string }> = {
  object: { title: 'Generate an object', placeholder: 'A worn astronaut helmet on a metal workbench…' },
  motion: { title: 'Generate motion', placeholder: 'A person turns slowly, notices the camera, and takes one careful step forward…' },
  redefine: { title: 'Redefine existing motion', placeholder: 'Make the movement heavier and more dramatic, but keep the same timing and landing pose…' },
};

export default function AIPanel({ onClose }: { onClose: () => void }) {
  const s = useStudio();
  const [mode, setMode] = useState<Mode>('object'), [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null), [motion, setMotion] = useState<MotionJob | null>(null), [generatedAssetId, setGeneratedAssetId] = useState<string | null>(null);
  const [draft, setDraft] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const signature = useMemo(() => sceneSignature(s.project), [s.project]);
  const selectedObject = s.project.objects.find(object => object.id === s.objectId);
  const selectedClip = s.project.clips?.find(clip => clip.id === s.selectedClip);
  const stale = proposal ? proposal.baseSignature !== signature : motion ? motion.baseSignature !== signature : false;
  useEffect(() => () => { request.current?.abort(); studio.patch({ preview: null }); }, []);

  function resetResult() { request.current?.abort(); setProposal(null); setMotion(null); setGeneratedAssetId(null); setDraft(''); setError(''); studio.patch({ preview: null, playing: false }); }
  function selectMode(next: Mode) { if (next !== mode) { resetResult(); setMode(next); } }
  async function createGemini(kind: 'object' | 'movement') {
    const controller = new AbortController(); request.current = controller;
    const snapshot = studio.get().project, result = await api.propose(kind, prompt, snapshot, s.objectId, controller.signal);
    const checked = applyProposal(snapshot, result);
    if (result.content.kind === 'movement') {
      const objectId = result.content.tracks[0].objectId;
      setGeneratedAssetId(animationLibrary.save(animationFromTracks(checked, objectId, result.prompt, 'ai', checked.tracks.filter(track => track.objectId === objectId))).id);
    }
    setProposal(result); setDraft(JSON.stringify(result.content, null, 2));
  }
  async function createHunyuan() {
    const controller = new AbortController(); request.current = controller;
    let job = await api.generateMotion(studio.get().project, prompt, selectedClip?.duration ?? studio.get().project.duration, uid(), controller.signal); setMotion(job);
    while (job.status === 'running') { await new Promise(resolve => setTimeout(resolve, 1500)); if (controller.signal.aborted) return; job = await api.motionJob(job.id); setMotion(job); }
    if (job.status === 'failed' || !job.animation) throw new Error(job.error ?? 'Hunyuan Motion did not return an animation.');
    setGeneratedAssetId(animationLibrary.save(job.animation).id);
  }
  async function generate() {
    resetResult(); setBusy(true);
    try { if (mode === 'object') await createGemini('object'); else if (selectedObject?.kind === 'humanoid') await createHunyuan(); else await createGemini('movement'); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Could not generate this result.'); }
    finally { setBusy(false); }
  }
  function edited(): Proposal {
    if (!proposal) throw new Error('Generate a result first.');
    return { ...proposal, content: proposalContentSchema.parse(JSON.parse(draft)) };
  }
  function preview() { try { studio.previewProposal(edited()); setError(''); } catch { studio.patch({ preview: null }); setError('This result is invalid or the scene changed. Generate it again.'); } }
  function apply() {
    try {
      if (motion?.animation) { if (mode === 'redefine' && selectedClip) studio.replaceAnimation(selectedClip.id, motion.animation); else studio.addAnimation(motion.animation); resetResult(); return; }
      if (!proposal) return;
      if (proposal.content.kind === 'movement') {
        const value = edited(), checked = applyProposal(studio.get().project, value), objectId = value.content.kind === 'movement' ? value.content.tracks[0].objectId : '';
        const asset = animationLibrary.save(animationFromTracks(checked, objectId, value.prompt, 'ai', checked.tracks.filter(track => track.objectId === objectId)));
        studio.selectObject(objectId); if (mode === 'redefine' && selectedClip) studio.replaceAnimation(selectedClip.id, asset); else studio.addAnimation(asset); resetResult(); return;
      }
      studio.applyProposal(edited()); resetResult();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not apply this result.'); }
  }
  const active = copy[mode];
  return <aside className="assistant-panel regenerate-panel" aria-label="Regenerate">
    <div className="panel-heading"><div><span className="eyebrow">AI filmmaking</span><h2><WandSparkles size={19} /> Regenerate</h2></div><button className="icon-button" aria-label="Close Regenerate" onClick={onClose}><X size={19} /></button></div>
    <p className="panel-copy regenerate-intro">Generate the world, create a performance, or reshape an animation you already have.</p>
    <div className="regenerate-actions" role="tablist" aria-label="Regenerate actions">
      <button className={mode === 'object' ? 'is-active' : ''} role="tab" aria-selected={mode === 'object'} onClick={() => selectMode('object')}><Box size={16} /><span>Object</span><small>Gemini concept</small></button>
      <button className={mode === 'motion' ? 'is-active' : ''} role="tab" aria-selected={mode === 'motion'} onClick={() => selectMode('motion')}><Film size={16} /><span>Motion</span><small>Hunyuan Motion 1B</small></button>
      <button className={mode === 'redefine' ? 'is-active' : ''} role="tab" aria-selected={mode === 'redefine'} onClick={() => selectMode('redefine')}><Layers3 size={16} /><span>Redefine</span><small>Keep what works</small></button>
    </div>
    <section className="regenerate-context"><span>{mode === 'object' ? 'Scene context' : 'Target'}</span><strong>{mode === 'object' ? `${s.project.objects.filter(object => !object.hidden).length} visible objects` : selectedClip ? selectedClip.name : selectedObject?.name ?? 'Select an object'}</strong><small>{mode === 'object' ? 'New assets appear as previews first.' : selectedObject?.kind === 'humanoid' ? 'Humanoid generation uses Hunyuan Motion 1B.' : 'Camera and prop tracks use editable keyframes.'}</small></section>
    <label className="field-label regenerate-prompt"><span>{active.title}</span><textarea aria-label="Regeneration prompt" rows={5} maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={active.placeholder} /></label>
    {mode === 'redefine' && !selectedClip && <p className="inline-error">Select an animation block in the timeline to redefine it.</p>}
    <button className="button primary wide regenerate-submit" disabled={busy || !prompt.trim() || mode === 'redefine' && !selectedClip || mode !== 'object' && !selectedObject} onClick={() => void generate()}>{busy ? <><LoaderCircle size={15} className="spin" />Generating…</> : 'Regenerate'}</button>
    {busy && <button className="button secondary wide" onClick={resetResult}>Cancel</button>}
    {proposal && <section className="suggestion-card regenerate-result" aria-label="Generated result" draggable={proposal.content.kind === 'movement' && !!generatedAssetId} onDragStart={event => { if (!generatedAssetId) return; event.dataTransfer.setData('application/x-composition-animation', generatedAssetId); event.dataTransfer.effectAllowed = 'copy'; }}><span className="eyebrow">Gemini result</span>{proposal.content.kind === 'object' && proposal.content.object.referenceAssetIds[0] && <img className="concept-image" src={assetUrl(proposal.content.object.referenceAssetIds[0])} alt="Generated object reference" />}<h3>{proposal.content.kind === 'object' ? proposal.content.object.name : 'Editable motion plan'}</h3>{proposal.content.kind === 'movement' && <p className="panel-copy">Drag this refinement onto a matching animation track, or preview and apply it here.</p>}<details><summary>Edit result</summary><textarea aria-label="Generated result JSON" className="proposal-json" rows={9} value={draft} onChange={event => { setDraft(event.target.value); studio.patch({ preview: null }); }} /></details><div className="panel-actions"><button className="button secondary" disabled={stale} onClick={preview}>Preview</button><button className="button primary" disabled={stale || !s.preview} onClick={apply}>{proposal.content.kind === 'object' ? 'Add object' : 'Add motion'}</button></div>{s.preview && <div className="preview-transport"><button className="button secondary" onClick={studio.togglePlay}><Play size={14} />{s.playing ? 'Pause' : 'Play'} preview</button><button className="button" onClick={() => studio.patch({ preview: null, playing: false })}>Dismiss</button></div>}</section>}
    {motion && <section className="suggestion-card regenerate-result" aria-label="Hunyuan Motion result" draggable={motion.status === 'completed' && !!generatedAssetId} onDragStart={event => { if (!generatedAssetId) return; event.dataTransfer.setData('application/x-composition-animation', generatedAssetId); event.dataTransfer.effectAllowed = 'copy'; }}><span className="eyebrow">Hunyuan Motion 1B</span><h3>{motion.status === 'running' ? 'Generating humanoid performance…' : motion.status === 'completed' ? 'Editable performance ready' : 'Motion generation failed'}</h3><p className="panel-copy">{motion.status === 'completed' ? 'Drag this take onto the humanoid track, or apply it directly.' : motion.error ?? 'The model is working on the take.'}</p>{motion.status === 'completed' && <div className="panel-actions"><button className="button primary" onClick={apply}>{mode === 'redefine' ? 'Replace animation' : 'Add animation'}</button></div>}</section>}
    {error && <p role="alert" className="inline-error">{error}</p>}
    {(proposal || motion) && stale && <p className="inline-error">The scene changed while this result was open. Generate again.</p>}
  </aside>;
}
