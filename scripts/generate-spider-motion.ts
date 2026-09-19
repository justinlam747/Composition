import 'dotenv/config';
import { createFalClient } from '@fal-ai/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const model = 'fal-ai/hunyuan-motion';
const directory = resolve('data/spider-man-hunyuan');
const motions = [
  { id: 'drop', name: 'Drop to floor', duration: 2, seed: 241,
    prompt: 'A person drops straight down from a short height, lands with both feet in a deep superhero crouch, absorbing the impact with bent knees, then rises to stand upright facing forward.' },
  { id: 'web', name: 'Shoot web', duration: 1.5, seed: 242,
    prompt: 'A person standing upright thrusts their right arm diagonally upward and forward with an open palm, like a superhero shooting a web from the wrist. The left arm balances behind. Hold the right arm extended upward.' },
  { id: 'swing', name: 'Swing and land', duration: 5.5, seed: 243,
    prompt: 'A person reaches their right arm overhead, hangs from one hand with bent knees and swings their body forward. They release their grip, drop down, land on both feet in a low crouch, then stand up.' },
];
type SavedRequest = { model: string; id: string; name: string; input: { prompt: string; duration: number; seed: number; output_format: 'fbx' }; requestId: string; submittedAt: string; completedAt?: string; elapsedSeconds?: number; file?: string };
if (!process.env.FAL_KEY?.trim()) throw new Error('Set FAL_KEY in the project .env before running this script.');
const fal = createFalClient({ credentials: process.env.FAL_KEY, retry: { maxRetries: 0 } });
await mkdir(directory, { recursive: true });
for (const motion of motions) {
  const manifest = resolve(directory, `${motion.id}.request.json`);
  let saved: SavedRequest | undefined;
  try { saved = JSON.parse(await readFile(manifest, 'utf8')) as SavedRequest; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (saved?.file) {
    await readFile(resolve(directory, saved.file));
    console.log(`${motion.name}: using saved generation ${saved.requestId}.`);
    continue;
  }
  if (!saved) {
    const input = { prompt: motion.prompt, duration: motion.duration, seed: motion.seed, output_format: 'fbx' as const };
    const submittedAt = new Date().toISOString();
    console.log(`${motion.name}: submitting live motion request.`);
    const submitted = await fal.queue.submit(model, { input });
    saved = { model, id: motion.id, name: motion.name, input, requestId: submitted.request_id, submittedAt };
    await writeFile(manifest, JSON.stringify(saved, null, 2) + '\n');
  }
  let previousStatus = '';
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const status = await fal.queue.status(model, { requestId: saved.requestId, logs: false });
    if (status.status !== previousStatus) { console.log(`${motion.name}: ${status.status}`); previousStatus = status.status; }
    if (status.status === 'COMPLETED') break;
    if (Date.now() > deadline) throw new Error(`${motion.name}: timed out waiting; the request ID is saved. Rerun to resume without submitting again.`);
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  const result = await fal.queue.result(model, { requestId: saved.requestId });
  await writeFile(resolve(directory, `${motion.id}.result.json`), JSON.stringify(result.data, null, 2) + '\n');
  const data = result.data as { fbx_file?: { url?: string } };
  if (!data.fbx_file?.url) throw new Error(`${motion.name}: the provider returned no FBX animation.`);
  const url = new URL(data.fbx_file.url);
  if (url.protocol !== 'https:' || !(url.hostname.endsWith('.fal.media') || url.hostname.endsWith('.fal.ai'))) throw new Error('Unexpected motion download host.');
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${motion.name}: download failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 60_000_000) throw new Error('Unexpected motion file size.');
  const file = `${motion.id}.fbx`;
  await writeFile(resolve(directory, file), bytes);
  saved = { ...saved, file, completedAt: new Date().toISOString(), elapsedSeconds: Math.round((Date.now() - Date.parse(saved.submittedAt)) / 100) / 10 };
  await writeFile(manifest, JSON.stringify(saved, null, 2) + '\n');
  console.log(`${motion.name}: downloaded ${bytes.length} bytes in ${saved.elapsedSeconds}s.`);
}
console.log(`Saved all three live Hunyuan Motion outputs in ${directory}.`);
