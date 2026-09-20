import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, Film, Play, Shapes, X } from 'lucide-react';
import { api, ApiError, assetUrl, type Capabilities, type Job } from '../core/api';
import { studio, useStudio } from '../core/store';
import { uid, type Project } from '../core/project';
import { sceneSignature, videoReferences } from '../core/proposals';
import { exportGuide } from '../scene/guideExport';
import { changeCameraView } from '../scene/cameraNavigation';
import { phoneCamera } from '../scene/phoneCamera';
import OutputImages from './OutputImages';
import ServiceIcon from './ServiceIcon';
import OutputPromptField from './OutputPromptField';
import { excludeVideoReference } from '../core/outputImages';
import './output.css';

const labels: Record<Job['status'], string> = { preparing: 'Uploading guide and references…', queued: 'Queued at Seedance…', running: 'Generating your video…', completed: 'Video ready', failed: 'Generation failed' };
const steps = ['Preview', 'Direction', 'Generate'];
export default function OutputPage({ onBack }: { onBack: () => void }) {
  const s = useStudio(), generation = s.project.generation;
  const [prompt, setPrompt] = useState(generation?.instructions ?? ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false), [ready, setReady] = useState(false), [job, setJob] = useState<Job | null>(null);
  const [guideDuration, setGuideDuration] = useState<number | null>(null);
  const [missingJob, setMissingJob] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [step, setStep] = useState(generation?.jobId || generation?.outputAssetId ? 3 : 1);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null), [connectionError, setConnectionError] = useState('');
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [imageBusy, setImageBusy] = useState(!!generation?.imageRequest);
  const [previewMode, setPreviewMode] = useState<'baseline' | 'motion'>('baseline');
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const jobId = generation?.jobId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setReviewed(false); setReady(false); setGuideDuration(null); }, [generation?.guideAssetId]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    let active = true;
    setCapabilities(null); setConnectionError('');
    api.capabilities().then(value => { if (active) setCapabilities(value); }).catch(cause => { if (active) setConnectionError((cause as Error).message); });
    return () => { active = false; };
  }, [connectionVersion]);
  useEffect(() => {
    setJob(null); setMissingJob(false); if (!jobId) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api.job(jobId!); if (!active) return; setJob(result); setMissingJob(false);
        if (result.status === 'completed' && result.outputAssetId) {
          setError('');
          const current = studio.get();
          if (current.project.generation?.jobId === result.id && current.project.generation.outputAssetId !== result.outputAssetId) {
            studio.generation({ ...current.project.generation, outputAssetId: result.outputAssetId });
            await api.saveProject(studio.get().project).catch(e => { if (active) setError(`Video is saved, but the project could not be updated: ${e.message}`); });
          }
        }
        if (!['completed', 'failed'].includes(result.status)) timer = setTimeout(poll, 3000);
      } catch (err) { if (active) { setMissingJob(err instanceof ApiError && err.status === 404); if (!(err instanceof ApiError && err.status === 404)) setError((err as Error).message); timer = setTimeout(poll, 5000); } }
    }
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, [jobId, refreshVersion]);
  const signature = useMemo(() => sceneSignature(s.project), [s.project]);
  const stale = generation && generation.sourceSignature !== signature;
  const pending = !!jobId && (!job || !['completed', 'failed'].includes(job.status));
  const references = videoReferences(s.project);
  async function capture() {
    setBusy(true); setError(''); setReviewed(false);
    try {
      const { blob, project } = await exportGuide();
      const asset = await api.upload(blob, 'guide', project.duration);
      if (sceneSignature(studio.get().project) !== sceneSignature(project)) throw new Error('The scene changed during export. Export a new guide.');
      const previous = studio.get().project.generation;
      const { jobId: _jobId, outputAssetId: _output, baselineAssetId, ...retained } = previous ?? {};
      studio.generation({ ...retained, ...(baselineAssetId && previous?.imageSources?.[baselineAssetId] === asset.id ? { baselineAssetId } : {}), guideAssetId: asset.id, sourceSignature: sceneSignature(project), instructions: prompt });
      await api.saveProject(studio.get().project);
    } catch (err) { if (mounted.current) setError((err as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function submit(project: Project, id: string, instructions: string) {
    setBusy(true); setError('');
    try {
      if (!studio.persistNow()) throw new Error('This browser could not save the request ID. Free browser storage and retry. No video request was sent.');
      // Keep the request reachable from Saved projects even if this panel closes or
      // another project becomes current before the provider responds.
      await api.saveProject(project);
      const result = await api.generate(project, instructions, id);
      if (studio.get().project.id === project.id && studio.get().project.generation?.jobId === result.id) {
        if (mounted.current) { setMissingJob(false); setRefreshVersion(version => version + 1); }
      }
    } catch (err) {
      // A structured rejection before job creation is definitive. Network loss is ambiguous:
      // keep the persisted ID so reload/status checks and explicit retries cannot duplicate it.
      if (err instanceof ApiError && (err.status >= 400 && err.status < 500 && err.status !== 409 || err.code === 'FAL_NOT_CONFIGURED')) {
        const current = studio.get().project;
        if (current.generation?.jobId === id) { const { jobId: _jobId, ...retained } = current.generation; studio.generation(retained); }
      }
      if (mounted.current) setError((err as Error).message);
    }
    finally { if (mounted.current) setBusy(false); }
  }
  async function generate() {
    const project = studio.get().project;
    if (!project.generation || !reviewed || !ready || project.generation.sourceSignature !== sceneSignature(project)) { setError('Preview and review a current guide before generating.'); return; }
    const id = uid();
    studio.generation({ ...project.generation, jobId: id, instructions: prompt });
    await submit(studio.get().project, id, prompt);
  }
  const output = job?.outputAssetId ?? generation?.outputAssetId;
  const baseline = generation?.baselineAssetId;
  const staleBaseline = !!baseline && generation?.imageSources?.[baseline] !== generation?.guideAssetId;
  const showBaseline = step > 1 && !!baseline && previewMode === 'baseline' && !(step === 3 && output);
  const currentGuide = !!generation && !stale && ready;
  const canContinue = currentGuide && reviewed;
  const liveCamera = s.camera === 'camera' || s.camera === 'ar';
  const validDuration = Number.isInteger(s.project.duration) && s.project.duration >= 4 && s.project.duration <= 10;
  const canReviewGeneration = canContinue && !!prompt.trim() && references.length <= 9 && !imageBusy && !staleBaseline;
  const canGenerate = canReviewGeneration && !s.project.demo && validDuration && capabilities?.fal;
  const resultDuration = job?.duration ?? guideDuration;
  const previewDuration = step === 3 && output ? resultDuration : generation ? guideDuration : s.project.duration;
  function restart() {
    if (generation) { const { jobId: _jobId, outputAssetId: _output, ...retained } = generation; studio.generation(retained); }
    setJob(null); setReviewed(false); setStep(1); setError('');
  }
  return <div className="output-shell">
    <header className="output-header"><div className="brand"><Shapes size={19} /><span>composition</span><span className="output-divider">/</span><span className="output-header-label">Output</span></div><button className="button secondary" disabled={busy || s.exporting} onClick={onBack}><ArrowLeft size={15} />Back to editor</button></header>
    <main className="output-main" aria-label="Output workflow">
      <div className="output-title"><div><h1>Output</h1><p>{s.project.name}</p></div><div className="output-services"><span className="service-label"><ServiceIcon service="gemini" />Gemini <small>Images</small></span><span className="service-label"><ServiceIcon service="fal" />fal <small>Video</small></span></div></div>
      <nav aria-label="Output steps"><ol className="output-steps">{steps.map((label, index) => <li key={label}><button aria-current={step === index + 1 ? 'step' : undefined} disabled={busy || index === 1 && !canContinue || index === 2 && !jobId && !output && !canReviewGeneration} onClick={() => setStep(index + 1)}><span className="step-number">{index === 0 && canContinue || index === 1 && prompt.trim() && step === 3 ? <Check size={16} /> : index + 1}</span><span>{label}</span></button></li>)}</ol></nav>
      <div className="output-layout">
        <section className="output-preview" aria-label="Composition preview">
          <div className="output-preview-heading"><span>{step === 3 && output ? 'Your generated video' : showBaseline ? 'Your visual baseline' : 'Your composition'}</span><span>{showBaseline ? '16:9' : `${previewDuration === null ? '—' : Math.round(previewDuration * 100) / 100}s · 720p · 16:9`}</span></div>
          {step > 1 && baseline && !(step === 3 && output) && <div className="output-preview-tabs" aria-label="Compare baseline and motion"><button aria-pressed={previewMode === 'baseline'} onClick={() => setPreviewMode('baseline')}>Visual baseline</button><button aria-pressed={previewMode === 'motion'} onClick={() => setPreviewMode('motion')}>Motion guide</button></div>}
          {showBaseline && <img className="output-baseline-preview" src={assetUrl(baseline!)} alt="Selected video baseline" />}
          {generation ? <video hidden={showBaseline || step === 3 && !!output} key={generation.guideAssetId} aria-label="Guide preview" src={assetUrl(generation.guideAssetId)} controls playsInline preload="auto" onLoadedData={e => { setReady(true); setGuideDuration(e.currentTarget.duration); }} onError={() => { setReady(false); setError('Preview unavailable. Check the connection and create a new preview.'); }} /> : <div className="output-preview-empty"><span className="output-preview-icon"><Play size={26} strokeWidth={1.3} /></span><strong>Composition preview</strong><p>Create a preview to get started.</p></div>}
          {step === 3 && output && <video key={output} aria-label="Generated video" src={assetUrl(output)} controls playsInline />}
          <div className="output-preview-caption"><Film size={14} /><p>{step === 3 && output ? 'Seedance output' : showBaseline ? 'Chosen look · Video follows your composition’s motion' : s.project.camera ? 'Scene camera · Includes camera motion' : 'Current editor framing'}</p></div>
          {generation && <a className="text-link output-guide-download" href={assetUrl(generation.guideAssetId, true)} download><Download size={14} />Download composition MP4</a>}
        </section>
        <section className="output-step-content" aria-labelledby="output-step-title">
          <h2 id="output-step-title" tabIndex={-1} ref={heading}>{step === 1 ? 'Preview composition' : step === 2 ? 'Create the look' : output ? 'Video ready' : 'Generate video'}</h2>
          {step === 1 && <>
            <p className="output-copy">Review your framing and motion.</p>
            {liveCamera && <div className="output-attention"><p>Stop camera / AR to create your preview. Live camera frames stay on this device.</p><button className="button secondary" onClick={() => void changeCameraView('orbit')}>Stop camera / AR</button></div>}
            {s.phoneControl && <div className="output-attention"><p>Finish phone control to use your saved camera motion.</p><button className="button secondary" onClick={phoneCamera.stop}>Stop phone control</button></div>}
            {!s.project.objects.some(o => !o.hidden) && <p className="inline-error">Add a visible object in the editor before creating a preview.</p>}
            {capabilities && !capabilities.videoExport && <p className="inline-error">Video export is unavailable on the server. Install the video encoder and restart the server.</p>}
            {stale && <p className="inline-error">Your composition has changed. Create a new preview to include your edits.</p>}
            <button className={`button ${currentGuide ? 'secondary' : 'primary'} wide`} disabled={busy || pending || imageBusy || liveCamera || s.phoneControl || !capabilities?.videoExport || !s.project.objects.some(o => !o.hidden)} onClick={capture}><Film size={16} />{busy ? 'Preparing preview…' : generation ? 'Create new preview' : 'Create preview'}</button>
            {busy && <div className="output-progress" role="status"><progress max={s.project.duration} value={s.exporting ? s.time : s.project.duration} /><p>{s.exporting ? `Recording ${s.time.toFixed(1)} / ${s.project.duration} seconds. Export pauses if this tab is hidden.` : 'Preparing your MP4 preview…'}</p></div>}
            {currentGuide && <label className="review-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />I’ve reviewed this composition</label>}
            <button className="button primary wide" aria-label="Continue to video direction" disabled={busy || !canContinue} onClick={() => setStep(2)}>Continue<ArrowRight size={16} /></button>
            <p className="output-note">Free preview. No AI credits used.</p>
          </>}
          {step === 2 && <>
            <OutputPromptField target="video" title={<span className="field-label">Video direction</span>} value={prompt} onChange={value => { setPrompt(value); studio.videoInstructions(value); }} configured={!!capabilities?.gemini} disabled={pending || !!output || !!stale} context={generation?.imagePrompt} />
            <div className="output-references"><h3>Video references <span>{references.length} / 9</span></h3>{references.length > 0 && <div className="reference-strip">{references.map((id, i) => <div key={id}><img src={assetUrl(id)} alt={`Video reference ${i + 1}`} /><button aria-label={`Remove video reference ${i + 1}`} disabled={busy || pending || !!output || imageBusy} onClick={() => { const next = excludeVideoReference(studio.get().project, id); if (next) { studio.generation(next); void api.saveProject(studio.get().project).catch(cause => setError(cause.message)); } }}><X size={13} /></button></div>)}</div>}</div>
            {references.length > 9 && <p className="inline-error">Remove reference images to use nine or fewer.</p>}
            {staleBaseline && <p className="inline-error">Choose a baseline from the current preview before continuing.</p>}
          </>}
          {generation && <div hidden={step !== 2}><OutputImages configured={!!capabilities?.gemini} disabled={busy || pending || !!output || !!stale} onBusyChange={setImageBusy} /></div>}
          {step === 2 && <>
            <button className="button primary wide" aria-label="Continue to generation" disabled={!canReviewGeneration} onClick={() => setStep(3)}>Continue<ArrowRight size={16} /></button>
            <button className="text-link" onClick={() => setStep(1)}>Back to preview</button>
          </>}
          {step === 3 && <>
            <div className="output-provider"><ServiceIcon service="bytedance" /><strong>Seedance</strong><span>via</span><ServiceIcon service="fal" /><span>fal</span></div>
            {stale && (jobId || output) && <p className="output-copy output-attention">This request uses an earlier version of your composition. Your request and any finished video stay available here.</p>}
            <dl className="output-summary"><div><dt>Video</dt><dd>{jobId || output ? resultDuration ?? '—' : s.project.duration}s · 720p · 16:9</dd></div><div><dt>Audio</dt><dd>Off</dd></div><div><dt>References</dt><dd>{jobId ? job ? `${job.referenceAssetIds.length} images` : 'Checking…' : `${references.length} images`}</dd></div></dl>
            <OutputPromptField target="video" title={<span className="field-label">Video direction</span>} value={prompt} onChange={value => { setPrompt(value); studio.videoInstructions(value); }} configured={!!capabilities?.gemini} disabled={pending || !!output || !!stale} context={generation?.imagePrompt} />
            {!jobId && !output && <>
              {!canContinue && <div className="output-attention"><p>Review a current preview before generating.</p><button className="button secondary" onClick={() => setStep(1)}>Review preview</button></div>}
              {s.project.demo && <div className="output-attention"><p>Turn off Demo mode to generate. Your animation stays intact.</p><button className="button secondary" onClick={studio.disableDemo}>Turn off Demo mode</button></div>}
              {!validDuration && <p className="inline-error">Set the timeline to a whole duration of 4–10 seconds in the editor, then create a new preview.</p>}
              {capabilities && !capabilities.fal && <p className="inline-error">Connect your fal account by setting FAL_KEY on the server, then restart it.</p>}
              <button className="button primary wide" disabled={busy || !canGenerate} onClick={generate}><ServiceIcon service="fal" />Generate with Seedance</button>
              <p className="output-note">Uses fal credits. Sends your motion guide{baseline ? ', chosen baseline' : ''} and references.</p>
            </>}
    {pending && !job && <section className="job-status" aria-live="polite"><strong>{missingJob ? 'Submission not confirmed' : 'Checking saved request…'}</strong>{missingJob && <><p className="panel-copy">The server has no record of this request yet. Retry with the saved ID to avoid creating a duplicate.</p><button className="button secondary" disabled={busy || !!stale || !generation?.instructions} onClick={() => submit(s.project, jobId!, generation!.instructions!)}>Retry same request</button>{stale && <p className="panel-copy">Undo scene changes to retry this guide. Status checks will continue.</p>}</>}</section>}
    {job && <section className="job-status" aria-label="Generation status" aria-live="polite"><strong>{labels[job.status]}</strong><small>Request {job.id.slice(0, 8)}</small>{job.error && <p className="inline-error">{job.error}</p>}{job.status === 'failed' && <button className="button secondary" onClick={restart}>Start another request</button>}</section>}
    {output && <><a className="button primary wide download-link" href={assetUrl(output, true)} download><Download size={15} />Download video</a><button className="text-link" onClick={restart}>Create another version</button></>}
    {pending && <p className="output-note">You can return to the editor. Your saved request will still be here when you come back.</p>}
          </>}
          {error && <p role="alert" className="inline-error">{error}</p>}
          {connectionError ? <div className="output-attention" role="alert"><p>{connectionError}</p><button className="button secondary" onClick={() => setConnectionVersion(value => value + 1)}>Retry connection</button></div> : !capabilities && <p className="output-note" role="status">Checking output connection…</p>}
        </section>
      </div>
    </main>
  </div>;
}
