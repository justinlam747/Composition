import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import ffmpeg from 'ffmpeg-static';
import { uid } from '../src/core/project';
import { AppError, FileStore } from './storage';

const execute = promisify(execFile);
export const videoExportAvailable = Boolean(ffmpeg);
export async function firstFrame(store: FileStore, guideId: string) {
  const guide = await store.requireAsset(guideId, 'guide');
  if (guide.firstFrameAssetId) return store.requireAsset(guide.firstFrameAssetId, 'reference');
  if (!ffmpeg) throw new AppError(503, 'ENCODER_MISSING', 'The video encoder is unavailable. Reinstall server dependencies.');
  try {
    const { stdout } = await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', store.file('assets', guideId, 'bin'), '-map', '0:v:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { encoding: 'buffer', timeout: 30000, windowsHide: true, maxBuffer: 10_000_000 });
    const asset = await store.asset(stdout, imageMime(stdout), 'reference', { width: guide.width, height: guide.height });
    await store.put('assets', guideId, { ...guide, firstFrameAssetId: asset.id });
    return asset;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'FRAME_UNAVAILABLE', 'Could not read the first frame. Create a new composition preview.');
  }
}
export function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new AppError(400, 'INVALID_IMAGE', 'Use a PNG, JPEG or WebP reference image.');
}
export async function saveGuide(store: FileStore, bytes: Buffer, duration: number) {
  if (!ffmpeg) throw new AppError(503, 'ENCODER_MISSING', 'The video encoder is unavailable. Reinstall server dependencies.');
  if (!Number.isFinite(duration) || duration < 2 || duration > 10) throw new AppError(400, 'INVALID_DURATION', 'Guide duration must be between 2 and 10 seconds.');
  const format = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? 'matroska' : bytes.toString('ascii', 4, 8) === 'ftyp' ? 'mov' : null;
  if (!format) throw new AppError(400, 'INVALID_VIDEO', 'Upload a WebM or MP4 guide recording.');
  const id = uid(), input = store.file('tmp', id, 'input'), output = store.file('tmp', id, 'mp4');
  await writeFile(input, bytes);
  try {
    await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-f', format, '-i', input,
      '-map', '0:v:0', '-an', '-t', String(duration), '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30,tpad=stop_mode=clone:stop_duration=0.25',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { timeout: 90_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    let probe = '';
    try { await execute(ffmpeg, ['-hide_banner', '-i', output], { timeout: 10000, windowsHide: true }); }
    catch (error) { probe = String((error as { stderr?: string }).stderr ?? ''); }
    const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    const actual = match ? +match[1] * 3600 + +match[2] * 60 + +match[3] : 0;
    if (Math.abs(actual - duration) > .25) throw new AppError(400, 'INCOMPLETE_GUIDE', 'The guide is incomplete. Keep the tab visible and export again.');
    return await store.asset(await readFile(output), 'video/mp4', 'guide', { duration: actual, width: 1280, height: 720 });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'INVALID_VIDEO', 'The guide could not be decoded. Export it again in Chrome or Edge.');
  } finally { await Promise.allSettled([unlink(input), unlink(output)]); }
}
export async function downloadOutput(url: string): Promise<Buffer> {
  for (let redirects = 0; redirects < 5; redirects++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !['fal.media', 'fal.ai', 'storage.googleapis.com'].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) throw new AppError(502, 'INVALID_OUTPUT_URL', 'The provider returned an unsupported output location.');
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'manual' });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) { url = new URL(response.headers.get('location')!, url).href; continue; }
    if (!response.ok || !response.body) throw new AppError(502, 'OUTPUT_DOWNLOAD', 'Could not download the generated video. Check job status again to retry.');
    const reader = response.body.getReader(), chunks: Buffer[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 100_000_000) throw new AppError(502, 'OUTPUT_TOO_LARGE', 'The output exceeds the 100 MB storage limit.'); chunks.push(Buffer.from(value)); } }
    finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    if (bytes.toString('ascii', 4, 8) !== 'ftyp') throw new AppError(502, 'INVALID_OUTPUT', 'The provider did not return an MP4 video.');
    return bytes;
  }
  throw new AppError(502, 'OUTPUT_REDIRECT', 'The provider returned too many download redirects.');
}
