import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus } from 'lucide-react';
import { api, ApiError, assetUrl, type Asset, type ImageJob } from '../core/api';
import { uid, type ImageRequest } from '../core/project';
import { videoReferences } from '../core/proposals';
import { studio, useStudio } from '../core/store';
import ServiceIcon from './ServiceIcon';

export default function OutputImages({ configured, disabled, onBusyChange }: { configured: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const s = useStudio(), generation = s.project.generation, request = generation?.imageRequest;
  const [prompt, setPrompt] = useState(request?.prompt ?? ''), [job, setJob] = useState<ImageJob | null>(null);
  const [error, setError] = useState(''), [requestError, setRequestError] = useState(''), [missing, setMissing] = useState(false), [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [frame, setFrame] = useState<{ guideId: string; asset: Asset } | null>(null), [frameError, setFrameError] = useState(''), [frameRefresh, setFrameRefresh] = useState(0);
  const [alternatives, setAlternatives] = useState<1 | 3>(1);
  const mounted = useRef(false), submittingRef = useRef(false);
  const pending = !!request && (!job || job.id !== request.id || job.status === 'running');
  const images = generation?.imageAssetIds ?? [], selected = generation?.referenceAssetIds ?? [];
  const count = videoReferences(s.project).length;
  const frameReady = frame?.guideId === generation?.guideAssetId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusyChange(pending || submitting); }, [pending, submitting, onBusyChange]);
  useEffect(() => {
    const guideId = generation?.guideAssetId;
    setFrame(null); setFrameError(''); if (!guideId) return;
    let active = true;
    api.guideFrame(guideId).then(asset => { if (active) setFrame({ guideId, asset }); }).catch(cause => { if (active) setFrameError(cause.message); });
    return () => { active = false; };
  }, [generation?.guideAssetId, frameRefresh]);
  useEffect(() => {
    setJob(null); setMissing(false); if (!request) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api.imageJob(request!.id);
        if (!active) return;
        setJob(result); setMissing(false); setRequestError('');
        const current = studio.get().project, currentGeneration = current.generation;
        const assets = result.assetIds ?? (result.assetId ? [result.assetId] : []);
        if (assets.length && current.id === result.projectId && currentGeneration?.imageRequest?.id === result.id && assets.some(id => !currentGeneration.imageAssetIds?.includes(id))) {
          studio.generation({ ...currentGeneration, imageAssetIds: [...new Set([...currentGeneration.imageAssetIds ?? [], ...assets])], ...(result.guideAssetId ? { imageSources: { ...currentGeneration.imageSources, ...Object.fromEntries(assets.map(id => [id, result.guideAssetId!])) } } : {}) });
          await api.saveProject(studio.get().project).catch(cause => { if (active) setError(`Image is saved, but the project could not be updated: ${cause.message}`); });
        }
        if (result.status === 'running') timer = setTimeout(poll, 2000);
      } catch (cause) {
        if (!active) return;
        setMissing(cause instanceof ApiError && cause.status === 404);
        if (!(cause instanceof ApiError && cause.status === 404)) setRequestError((cause as Error).message);
        timer = setTimeout(poll, 4000);
      }
    }
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, [request?.id, refresh]);
  async function submit(input: ImageRequest, newRequest = false) {
    const { id } = input;
    if (submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setError(''); setRequestError('');
    let dispatched = false;
    try {
      if (!studio.persistNow()) throw new Error('Could not save the image request. Free browser storage and retry. No request was sent.');
      const project = studio.get().project;
      await api.saveProject(project);
      dispatched = true;
      await api.generateImage(project.id, input);
      if (mounted.current) { setMissing(false); setRefresh(value => value + 1); }
    } catch (cause) {
      // A retry may refer to an accepted request. Retain its ID unless the server
      // definitively rejects it; a new request can also clear before dispatch.
      if (newRequest && !dispatched || dispatched && cause instanceof ApiError && (cause.status >= 400 && cause.status < 500 && cause.status !== 409 || cause.code === 'GEMINI_NOT_CONFIGURED')) {
        const current = studio.get().project.generation;
        if (current?.imageRequest?.id === id) { const { imageRequest: _request, ...retained } = current; studio.generation(retained); }
      }
      if (mounted.current) { setRequestError((cause as Error).message); setRefresh(value => value + 1); }
    }
    finally { submittingRef.current = false; if (mounted.current) setSubmitting(false); }
  }
  function generate() {
    if (!generation || pending || submittingRef.current || disabled || !configured || !frameReady || !prompt.trim() || images.length + alternatives > 24) return;
    const next: ImageRequest = { id: uid(), prompt: prompt.trim(), guideAssetId: generation.guideAssetId, count: alternatives };
    studio.generation({ ...generation, imageRequest: next });
    void submit(next, true);
  }
  function chooseBaseline(id: string) {
    const project = studio.get().project, current = project.generation;
    if (!current || disabled || current.imageSources?.[id] !== current.guideAssetId) return;
    const { baselineAssetId, ...retained } = current;
    const next = { ...project, generation: { ...retained, ...(baselineAssetId !== id ? { baselineAssetId: id } : {}) } };
    if (videoReferences(next).length > 9) return;
    studio.generation(next.generation);
    void api.saveProject(studio.get().project).catch(cause => { if (mounted.current) setError(cause.message); });
  }
  function toggleReference(id: string) {
    const project = studio.get().project, current = project.generation;
    if (!current || disabled) return;
    const ids = current.referenceAssetIds ?? [], included = ids.includes(id);
    if (!included && videoReferences(project).length >= 9) return;
    studio.generation({ ...current, referenceAssetIds: included ? ids.filter(value => value !== id) : [...ids, id] });
    void api.saveProject(studio.get().project).catch(cause => { if (mounted.current) setError((cause as Error).message); });
  }
  return <section className="output-images" aria-label="Image generation">
    <div className="output-section-title"><h3><ImagePlus size={15} />Visual baseline <span>Optional</span></h3><span className="service-label"><ServiceIcon service="gemini" />Gemini</span></div>
    {frameReady && frame ? <div className="output-frame-source"><img src={assetUrl(frame.asset.id)} alt="Composition first frame" /><div><strong>First frame</strong><p>Keep the composition. Describe the finished look.</p></div></div> : frameError ? <div className="output-attention"><p>{frameError}</p><button className="text-link" onClick={() => setFrameRefresh(value => value + 1)}>Retry first frame</button></div> : <p className="output-note" role="status">Preparing first frame…</p>}
    <label className="sr-only" htmlFor="image-prompt">Image prompt</label>
    <textarea id="image-prompt" rows={2} maxLength={4000} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={disabled || pending} placeholder="Describe a character, setting or style…" />
    {!configured && <p className="output-note">Connect Gemini on the server to generate images.</p>}
    {job?.status === 'failed' ? <div className="output-attention" role="alert"><p>{job.error}</p>{!!job.assetIds?.length && <p>{job.assetIds.length} of {job.count ?? 1} images saved below.</p>}<button className="button secondary" disabled={disabled} onClick={() => { if (generation) { const { imageRequest: _request, ...retained } = generation; studio.generation(retained); } setJob(null); setError(''); setRequestError(''); }}>Start another image</button></div> : pending ? <div className="output-image-status" role="status"><span>{missing ? 'Image request not confirmed.' : `Generating ${(job?.assetIds?.length ?? 0) + 1} of ${request?.count ?? 1}…`}</span>{missing && <button className="text-link" disabled={disabled || submitting} onClick={() => void submit(request!)}>Retry same image request</button>}</div> : <div className="output-image-actions"><select aria-label="Image options" value={alternatives} disabled={disabled} onChange={event => setAlternatives(Number(event.target.value) as 1 | 3)}><option value={1}>1 image</option><option value={3}>3 alternatives</option></select><button className="button secondary" disabled={disabled || !configured || !frameReady || !prompt.trim() || images.length + alternatives > 24} onClick={generate}><ServiceIcon service="gemini" />{alternatives === 3 ? 'Generate 3 alternatives' : 'Generate image'}</button></div>}
    <p className="output-note">Uses Gemini credits per image. Choose one baseline to guide the video's look; results may vary.</p>
    {images.length >= 24 && <p className="output-note">This project has reached its 24-image limit.</p>}
    {images.length > 0 && <div className="output-image-grid">{images.map((id, index) => <figure key={id} className={generation?.baselineAssetId === id ? 'is-baseline' : undefined}><a href={assetUrl(id)} target="_blank" rel="noreferrer" aria-label={`Open generated image ${index + 1}`}><img src={assetUrl(id)} alt={`Generated image ${index + 1}`} /></a><figcaption>{generation?.imageSources?.[id] ? <button aria-label={`Use image ${index + 1} as baseline`} aria-pressed={generation.baselineAssetId === id} disabled={disabled || generation.imageSources[id] !== generation.guideAssetId || !generation.baselineAssetId && count >= 9} onClick={() => chooseBaseline(id)}>{generation.imageSources[id] !== generation.guideAssetId ? 'Earlier preview' : generation.baselineAssetId === id ? 'Selected baseline' : 'Use baseline'}</button> : <label><input type="checkbox" checked={selected.includes(id)} disabled={disabled || !selected.includes(id) && count >= 9} onChange={() => toggleReference(id)} />Use for video</label>}<a href={assetUrl(id, true)} download aria-label={`Download image ${index + 1}`} title="Download image"><Download size={15} /></a></figcaption></figure>)}</div>}
    {images.length > 0 && count >= 9 && <p className="output-note">All 9 video reference slots are in use.</p>}
    {(error || requestError) && <p className="inline-error" role="alert">{error || requestError}</p>}
  </section>;
}
