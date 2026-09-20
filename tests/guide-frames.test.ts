import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { expect, it } from 'vitest';
import { FileStore } from '../server/storage';
import { firstFrame, lastFrame } from '../server/media';

it('extracts and caches the actual first and final frames without losing metadata during concurrent requests', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'composition-frames-test-'));
  try {
    const execute = promisify(execFile), file = path.join(directory, 'frames.mp4'), store = new FileStore(directory); await store.init();
    await execute(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:s=32x32:r=30:d=1', '-f', 'lavfi', '-i', 'color=blue:s=32x32:r=30:d=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libx264', file], { windowsHide: true, timeout: 30000 });
    const guide = await store.asset(await readFile(file), 'video/mp4', 'guide', { duration: 2 });
    const [first, last] = await Promise.all([firstFrame(store, guide.id), lastFrame(store, guide.id)]);
    expect(first.id).not.toBe(last.id);
    for (const [asset, dominant] of [[first, 0], [last, 2]] as const) {
      const { stdout } = await execute(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-i', store.file('assets', asset.id, 'bin'), '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', windowsHide: true, timeout: 30000 });
      expect(stdout[dominant]).toBeGreaterThan(240); expect(stdout[dominant === 0 ? 2 : 0]).toBeLessThan(10);
    }
    expect(await store.requireAsset(guide.id)).toMatchObject({ firstFrameAssetId: first.id, lastFrameAssetId: last.id });
    expect((await firstFrame(store, guide.id)).id).toBe(first.id); expect((await lastFrame(store, guide.id)).id).toBe(last.id);
  } finally { if (path.resolve(directory).startsWith(path.join(os.tmpdir(), 'composition-frames-test-'))) await rm(directory, { recursive: true, force: true }); }
}, 30000);
