import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, ImagePlus, Trash2, Upload } from 'lucide-react';
import { api, ApiError, assetUrl, type Asset, type ImageJob } from '../core/api';
import { uid, type ImageRequest } from '../core/project';
import { videoReferences } from '../core/proposals';
import { studio, useStudio } from '../core/store';
import ServiceIcon from './ServiceIcon';
import { excludeVideoReference, imageGenerationReferences, removeOutputImage } from '../core/outputImages';

export default function OutputImages({ configured, disabled, prompt, continueDisabled, onContinue, onBusyChange }: {
  configured: boolean; disabled: boolean; prompt: string; continueDisabled: boolean; onContinue: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const s = useStudio(), generation = s.project.generation, request = generation?.imageRequest;
  const [job, setJob] = useState<ImageJob | null>(null);
  const [error, setError] = useState(''), [requestError, setRequestError] = useState(''), [missing, setMissing] = useState(false), [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [refresh, setRefresh] = useState(0);
  const [frame, setFrame] = useState<{ guideId: string; asset: Asset; last: Asset } | null>(null), [frameError, setFrameError] = useState(''), [frameRefresh, setFrameRefresh] = useState(0);
  const mounted = useRef(false), submittingRef = useRef(false);
  const pending = !!request && (!job || job.id !== request.id || job.status === 'running');
  const images = generation?.imageAssetIds ?? [], selected = videoReferences(s.project);
  const blocked = disabled || pending || submitting || uploading;
  const imageReferences = imageGenerationReferences(generation);
  const count = selected.length;
  const frameReady = frame?.guideId === generation?.guideAssetId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusyChange(pending || submitting || uploading); }, [pending, submitting, uploading, onBusyChange]);
  useEffect(() => {
    const guideId = generation?.guideAssetId;
    setFrame(null); setFrameError(''); if (!guideId) return;
    let active = true;
    Promise.all([api.guideFrame(guideId), api.guideFrame(guideId, 'last')]).then(([asset, last]) => { if (active) setFrame({ guideId, asset, last }); }).catch(cause => { if (active) setFrameError(cause.message); });
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
        const assets = (result.assetIds ?? (result.assetId ? [result.assetId] : [])).filter(id => !currentGeneration?.dismissedImageAssetIds?.includes(id));
        const pairs = Object.fromEntries(Object.entries(result.imagePairs ?? {}).filter(([first, last]) => assets.includes(first) && assets.includes(last)));
        if (assets.length && current.id === result.projectId && currentGeneration?.imageRequest?.id === result.id && (assets.some(id => !currentGeneration.imageAssetIds?.includes(id)) || Object.entries(pairs).some(([first, last]) => currentGeneration.imagePairs?.[first] !== last))) {
          studio.generation({ ...currentGeneration, imageAssetIds: [...new Set([...currentGeneration.imageAssetIds ?? [], ...assets])], imagePairs: { ...currentGeneration.imagePairs, ...pairs }, ...(result.guideAssetId ? { imageSources: { ...currentGeneration.imageSources, ...Object.fromEntries(assets.map(id => [id, result.guideAssetId!])) } } : {}) });
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
    if (!generation || blocked || submittingRef.current || !configured || !frameReady || !prompt.trim()) return;
    const next: ImageRequest = { id: uid(), prompt: prompt.trim(), guideAssetId: generation.guideAssetId, paired: true, referenceAssetIds: imageReferences };
    studio.generation({ ...generation, imageRequest: next, uploadedImageAssetIds: imageReferences, dismissedImageAssetIds: [] });
    void submit(next, true);
  }
  function chooseBaseline(id: string) {
    const project = studio.get().project, current = project.generation;
    if (!current || blocked || current.imageSources?.[id] !== current.guideAssetId) return;
    const { baselineAssetId, ...retained } = current;
    const next = { ...project, generation: { ...retained, ...(baselineAssetId !== id ? { baselineAssetId: id } : {}) } };
    if (videoReferences(next).length > 9) return;
    studio.generation(next.generation);
    void api.saveProject(studio.get().project).catch(cause => { if (mounted.current) setError(cause.message); });
  }
  function toggleReference(id: string) {
    const project = studio.get().project, current = project.generation;
    if (!current || blocked) return;
    const ids = current.referenceAssetIds ?? [], included = videoReferences(project).includes(id);
    if (!included && videoReferences(project).length >= 9) return;
    studio.generation(included ? excludeVideoReference(project, id)! : { ...current, referenceAssetIds: [...new Set([...ids, id])], excludedReferenceAssetIds: current.excludedReferenceAssetIds?.filter(value => value !== id) });
    void api.saveProject(studio.get().project).catch(cause => { if (mounted.current) setError((cause as Error).message); });
  }
  async function upload(files: FileList | null) {
    if (!files?.length || blocked) return;
    const projectId = s.project.id;
    setUploading(true); setError('');
    try {
      for (const file of Array.from(files)) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 30_000_000) throw new Error('Use PNG, JPEG or WebP images under 30 MB.');
        const asset = await api.upload(file, 'reference');
        const project = studio.get().project, current = project.generation;
        if (project.id !== projectId || !current) return;
        const withReference = { ...current, referenceAssetIds: [...new Set([...current.referenceAssetIds ?? [], asset.id])], excludedReferenceAssetIds: current.excludedReferenceAssetIds?.filter(id => id !== asset.id) };
        const include = videoReferences({ ...project, generation: withReference }).length <= 9;
        studio.generation({ ...current, imageAssetIds: [...new Set([...current.imageAssetIds ?? [], asset.id])], uploadedImageAssetIds: [...new Set([...imageGenerationReferences(current), asset.id])],
          dismissedImageAssetIds: current.dismissedImageAssetIds?.filter(id => id !== asset.id),
          ...(include ? { referenceAssetIds: withReference.referenceAssetIds, excludedReferenceAssetIds: withReference.excludedReferenceAssetIds } : {}) });
        await api.saveProject(studio.get().project);
      }
    } catch (cause) { if (mounted.current) setError((cause as Error).message); }
    finally { if (mounted.current) setUploading(false); }
  }
  function remove(id: string) {
    const current = studio.get().project.generation;
    if (!current || blocked) return;
    studio.generation(removeOutputImage(excludeVideoReference(studio.get().project, id)!, id, job?.assetIds ?? (job?.assetId ? [job.assetId] : [])));
    void api.saveProject(studio.get().project).catch(cause => { if (mounted.current) setError(cause.message); });
  }
  const lastIds = new Set(Object.values(generation?.imagePairs ?? {}));
  return <section className="output-images" aria-label="Image generation">
    <div className="output-section-title"><h3><ImagePlus size={15} />Visual baseline <span>Optional</span></h3></div>
    {frameReady && frame ? <div className="output-frame-sources"><figure><img src={assetUrl(frame.asset.id)} alt="Composition first frame" /><figcaption>First frame</figcaption></figure><figure><img src={assetUrl(frame.last.id)} alt="Composition last frame" /><figcaption>Last frame</figcaption></figure></div> : frameError ? <div className="output-attention"><p>{frameError}</p><button className="text-link" onClick={() => setFrameRefresh(value => value + 1)}>Retry composition frames</button></div> : <p className="output-note" role="status">Preparing composition frames...</p>}
    {job?.status === 'failed' ? <div className="output-attention" role="alert"><p>{job.error}</p>{!!job.assetIds?.length && <p>{job.assetIds.length} images saved below.</p>}<button className="button secondary" disabled={disabled} onClick={() => { const current = studio.get().project.generation; if (current) { const { imageRequest: _request, ...retained } = current; studio.generation(retained); } setJob(null); setError(''); setRequestError(''); }}>Start another image</button></div> : pending ? <div className="output-image-status" role="status"><span>{missing ? 'Image request not confirmed.' : `Generating image ${Math.min((job?.assetIds?.length ?? 0) + 1, (request?.count ?? 1) * (request?.paired ? 2 : 1))} of ${(request?.count ?? 1) * (request?.paired ? 2 : 1)}...`}</span>{missing && <button className="text-link" disabled={disabled || submitting} onClick={() => void submit(request!)}>Retry same image request</button>}</div> : <div className="output-image-actions"><button className="button secondary" disabled={blocked || !configured || !frameReady || !prompt.trim()} onClick={generate}><ServiceIcon service="gemini" />Generate images</button></div>}
    <p className="output-note">Generate matching first and last images using this prompt{imageReferences.length ? ` and all ${imageReferences.length} uploaded references` : ''}. Each click creates another pair and uses 2 Gemini image generations.</p>
    {images.length > 0 && <div className="output-image-grid">{images.map((id, index) => {
      const last = generation?.imagePairs?.[id], isLast = lastIds.has(id), isBaseline = generation?.baselineAssetId === id || !!generation?.baselineAssetId && generation.imagePairs?.[generation.baselineAssetId] === id;
      const stale = !!generation?.imageSources?.[id] && generation.imageSources[id] !== generation.guideAssetId;
      const fits = !generation || videoReferences({ ...s.project, generation: { ...generation, baselineAssetId: id } }).length <= 9;
      return <figure key={id} className={isBaseline ? 'is-baseline' : undefined}><a href={assetUrl(id)} target="_blank" rel="noreferrer" aria-label={`Open image ${index + 1}`}><img loading="lazy" src={assetUrl(id)} alt={`Image ${index + 1}${last ? ' - First frame' : isLast ? ' - Last frame' : ''}`} /></a><figcaption>
        <div>{generation?.imageSources?.[id] ? isLast ? <span>Last frame - {isBaseline ? 'Selected pair' : 'Paired with first'}</span> : <button aria-label={`Use image ${index + 1} as baseline`} aria-pressed={isBaseline} disabled={blocked || stale || !isBaseline && !fits} onClick={() => chooseBaseline(id)}>{stale ? 'Earlier preview' : isBaseline ? 'Selected baseline' : last ? 'Use frame pair' : 'Use baseline'}</button> : <label><input type="checkbox" checked={selected.includes(id)} disabled={blocked || !selected.includes(id) && count >= 9} onChange={() => toggleReference(id)} />Use for video</label>}</div>
        <a href={assetUrl(id, true)} download aria-label={`Download image ${index + 1}`} title="Download image"><Download size={15} /></a><button aria-label={`Remove image ${index + 1}`} title="Remove image" disabled={blocked} onClick={() => remove(id)}><Trash2 size={15} /></button>
      </figcaption></figure>;
    })}</div>}
    {images.length > 0 && count >= 9 && <p className="output-note">All 9 video reference slots are in use. Unselect a reference to choose another.</p>}
    {(error || requestError) && <p className="inline-error" role="alert">{error || requestError}</p>}
    <div className="output-direction-actions">
      <input ref={uploadInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="Upload reference images" disabled={blocked} onChange={event => { void upload(event.target.files); event.target.value = ''; }} />
      <button className="button secondary" disabled={blocked} onClick={() => uploadInput.current?.click()}><Upload size={15} />{uploading ? 'Uploading...' : 'Upload images'}</button>
      <button className="button primary" aria-label="Continue to generation" disabled={continueDisabled} onClick={onContinue}>Continue<ArrowRight size={16} /></button>
    </div>
  </section>;
}
