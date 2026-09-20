import { AppError, type FileStore, type StoredJob } from './storage';
import { referenceImage } from './imageInputs';
import { downloadOutput } from './media';
import { veoInputError } from '../src/core/videoModels';

const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
function headers(key?: string) {
  if (!key) throw new AppError(503, 'GEMINI_NOT_CONFIGURED', 'Configure GEMINI_API_KEY on the server to generate with Veo.');
  return { 'Content-Type': 'application/json', 'x-goog-api-key': key };
}
export async function submitVeo(store: FileStore, job: StoredJob, key?: string): Promise<string> {
  const auth = headers(key);
  const issue = veoInputError(job.duration, job.referenceAssetIds, job.baselineAssetId, job.lastBaselineAssetId);
  if (issue) throw new AppError(400, 'VEO_INPUT', issue);
  const image = async (id: string) => ({ inlineData: await referenceImage(store, id) });
  const instance = {
    prompt: job.prompt,
    ...(job.baselineAssetId ? { image: await image(job.baselineAssetId), ...(job.lastBaselineAssetId ? { lastFrame: await image(job.lastBaselineAssetId) } : {}) } :
      job.referenceAssetIds.length ? { referenceImages: await Promise.all(job.referenceAssetIds.map(async id => ({ image: await image(id), referenceType: 'asset' }))) } : {}),
  };
  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(job.model)}:predictLongRunning`, {
    method: 'POST', headers: auth, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ instances: [instance], parameters: { durationSeconds: job.duration, aspectRatio: '16:9', resolution: '720p', sampleCount: 1 } }),
  });
  if (!response.ok) throw new AppError(502, 'VEO_REQUEST_FAILED', `Veo rejected the request (HTTP ${response.status}). Check Gemini model access, billing and quota.`);
  const data = await response.json() as { name?: string };
  if (!data.name || !validOperation(data.name)) throw new AppError(502, 'VEO_OPERATION', 'Veo returned no valid operation ID. Check your Gemini account before retrying.');
  return data.name;
}
function validOperation(name: string) { return /^models\/veo-[\w.-]+\/operations\/[\w-]+$/.test(name); }
export async function pollVeo(job: StoredJob, key?: string): Promise<{ status: 'running' | 'completed'; output?: Buffer }> {
  const auth = headers(key);
  if (!job.requestId || !validOperation(job.requestId)) throw new AppError(422, 'VEO_OPERATION', 'The saved Veo operation ID is invalid.');
  const response = await fetch(`${baseUrl}/${job.requestId}`, { headers: auth, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new AppError(response.status, 'VEO_STATUS', `Could not check Veo (HTTP ${response.status}). Check Gemini access and quota.`);
  const data = await response.json() as { done?: boolean; error?: unknown; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } } };
  if (data.error) throw new AppError(422, 'VEO_FAILED', 'Veo could not generate this video. Check the request in your Gemini account and try different direction or images.');
  if (!data.done) return { status: 'running' };
  const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new AppError(502, 'NO_VIDEO', 'Veo returned no video. The request may have been filtered; try different direction or images.');
  return { status: 'completed', output: await downloadOutput(uri, key) };
}
