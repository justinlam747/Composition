import { expect, test, type Page } from '@playwright/test';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import type { PhoneDiagnostics } from '../../src/core/phoneProtocol';

declare global { interface Window {
  receiver: { accept(message: unknown): Promise<void>; close(): void };
  nativeMessage(message: unknown): void;
} }

async function scene(page: Page) { return page.evaluate(async () => { const path = '/src/core/store.ts'; return (await import(path)).studio.get(); }); }
async function pair(page: Page) {
  await page.goto('/#editor'); await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Phone camera', exact: true }).click();
  await page.getByRole('button', { name: 'Pair iPhone', exact: true }).click();
  const code = await page.locator('.phone-pairing strong').innerText();
  const phone = new WebSocket(`ws://127.0.0.1:3004/phone?code=${code}`); await once(phone, 'open');
  let sequence = 0, tracking = 'normal';
  let position: number[] | undefined, quaternion = [0, 0, 0, 1];
  const timer = setInterval(() => {
    if (phone.readyState === WebSocket.OPEN) phone.send(JSON.stringify({ type: 'pose', version: 1, seq: ++sequence, time: sequence / 30,
      tracking, position: position ?? [sequence / 300, 0, 0], quaternion }));
  }, 34);
  await expect(page.getByText('Tracking ready', { exact: true })).toBeVisible();
  return { phone, limited: () => { tracking = 'limited'; }, pause: () => clearInterval(timer),
    control: (action: string) => phone.send(JSON.stringify({ type: 'control', action })),
    settings: (translationScale: number) => phone.send(JSON.stringify({ type: 'settings', translationScale })),
    pose: (value: number[], rotation = [0, 0, 0, 1]) => { position = value; quaternion = rotation; },
    close: () => { clearInterval(timer); phone.close(); } };
}

test('shows received and mapped translation live without recording, and clears stale readings', async ({ page }) => {
  const sender = await pair(page);
  await expect(page.getByRole('region', { name: 'Position tracking', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Phone camera options' }).click();
  await page.getByRole('menuitemradio', { name: 'Debug information' }).click();
  sender.settings(1);
  await expect(page.getByRole('slider', { name: 'Movement sensitivity' })).toHaveValue('1');
  const received = page.getByLabel('Received phone position', { exact: true });
  const mapped = page.getByLabel('Mapped camera position', { exact: true });
  const cameraPose = () => page.evaluate(async () => {
    const path = '/src/scene/phoneCamera.ts'; return (await import(path)).phoneCamera.pose();
  });
  try {
    sender.pose([0, 0, 0]);
    await expect(received).toHaveText('0.000, 0.000, 0.000'); await expect(mapped).toHaveText('—');
    await page.getByRole('button', { name: 'Set starting pose', exact: true }).click();
    await expect(mapped).not.toHaveText('—');
    const start = await cameraPose();
    sender.pose([0, 0, -0.5]);
    await expect(received).toHaveText('0.000, 0.000, -0.500');
    await expect.poll(async () => {
      const next = await cameraPose(); return Math.hypot(...next.position.map((v: number, i: number) => v - start.position[i]));
    }).toBeCloseTo(.5, 6);
    const moved = await cameraPose();
    await expect(mapped).toHaveText(moved.position.map((v: number) => v.toFixed(3)).join(', '));
    sender.pose([0, 0, -0.5], [0, Math.sin(.3), 0, Math.cos(.3)]);
    await expect.poll(async () => (await cameraPose()).quaternion).not.toEqual(moved.quaternion);
    expect((await cameraPose()).position).toEqual(moved.position);
    expect((await scene(page)).project.clips ?? []).toHaveLength(0);
    sender.pause();
    await expect(received).toHaveText('—'); await expect(mapped).toHaveText('—');
  } finally { sender.close(); }
});

test('amplifies translation and rebases sensitivity and native pause/resume without a jump', async ({ page }) => {
  const sender = await pair(page);
  const info = () => page.evaluate(async () => { const path = '/src/scene/phoneCamera.ts'; const { phoneCamera } = await import(path); return { state: phoneCamera.get(), pose: phoneCamera.pose(), positions: phoneCamera.positionDiagnostics() }; });
  const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
  const acknowledgments: { paused: boolean; translationScale: number }[] = [];
  sender.phone.on('message', (data, binary) => { if (!binary) { const value = JSON.parse(data.toString()); if (value.type === 'state') acknowledgments.push(value); } });
  try {
    await expect(page.getByRole('slider', { name: 'Movement sensitivity' })).toHaveValue('5');
    sender.pose([0, 0, 0]); await expect.poll(async () => (await info()).positions.received).toEqual([0, 0, 0]);
    await page.getByRole('button', { name: 'Set starting pose', exact: true }).click();
    const start = (await info()).pose;
    sender.pose([0, 0, -.2]);
    await expect.poll(async () => distance((await info()).pose.position, start.position)).toBeCloseTo(1, 6);
    const beforeScale = (await info()).pose;
    sender.settings(10); await expect(page.getByRole('slider', { name: 'Movement sensitivity' })).toHaveValue('10');
    expect(distance((await info()).pose.position, beforeScale.position)).toBeLessThan(1e-8);
    sender.pose([0, 0, -.3]);
    await expect.poll(async () => distance((await info()).pose.position, beforeScale.position)).toBeCloseTo(1, 6);
    sender.control('pause'); await expect(page.getByRole('button', { name: 'Resume camera' })).toBeVisible();
    const held = (await info()).pose;
    const rotation = [0, Math.sin(.3), 0, Math.cos(.3)];
    sender.pose([2, 1, -2], rotation); await expect.poll(async () => (await info()).positions.received).toEqual([2, 1, -2]);
    expect((await info()).pose).toEqual(held);
    await expect.poll(() => acknowledgments.at(-1)?.paused).toBe(true);
    expect(acknowledgments.at(-1)?.translationScale).toBe(10);
    sender.control('resume'); await expect(page.getByRole('button', { name: 'Pause camera' })).toBeVisible();
    const resumed = (await info()).pose;
    expect(distance(resumed.position, held.position)).toBeLessThan(1e-8);
    for (let i = 0; i < 4; i++) expect(resumed.quaternion[i]).toBeCloseTo(held.quaternion[i], 8);
    sender.pose([2, 1, -2.1], rotation);
    await expect.poll(async () => distance((await info()).pose.position, held.position)).toBeCloseTo(1, 6);
    await expect.poll(() => acknowledgments.at(-1)?.paused).toBe(false);
    await page.screenshot({ path: 'test-results/phone-camera-light-controls.png', fullPage: true });
  } finally { sender.close(); }
});

test('pauses recording time, ignores repositioning and rejects sensitivity changes during a take', async ({ page }) => {
  const sender = await pair(page);
  const info = () => page.evaluate(async () => { const path = '/src/scene/phoneCamera.ts'; return (await import(path)).phoneCamera.get(); });
  try {
    sender.pose([0, 0, 0]);
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Set starting pose', exact: true }).click();
    sender.control('record'); await expect.poll(async () => (await info()).recording).toBe(true);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Pause camera' }).click();
    const paused = await info(), time = (await scene(page)).time;
    sender.pose([4, 0, -4]); sender.settings(9);
    await page.waitForTimeout(1000);
    expect((await info()).elapsed).toBe(paused.elapsed); expect((await scene(page)).time).toBe(time);
    expect((await info()).translationScale).toBe(5);
    await expect(page.getByRole('slider', { name: 'Movement sensitivity' })).toBeDisabled();
    await page.getByRole('button', { name: 'Resume camera' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Stop & save/ }).click();
    const clip = (await scene(page)).project.clips[0];
    expect(clip.duration).toBeGreaterThan(.3); expect(clip.duration).toBeLessThan(1.2);
    const positions = clip.tracks.find((track: { channel: string }) => track.channel === 'position').keys;
    for (const key of positions) for (let i = 0; i < 3; i++) expect(key.value[i]).toBeCloseTo(positions[0].value[i], 6);
    expect((await info()).paused).toBe(false);
  } finally { sender.close(); }
});

test('phone stream drives a transient camera and records an undoable, persistent camera block with a returned preview', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const sender = await pair(page);
  try {
    let previews = 0; sender.phone.on('message', (_data, binary) => { if (binary) previews++; });
    await page.getByRole('button', { name: 'Set starting pose', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Record camera move', exact: true })).toBeEnabled();
    const original = (await scene(page)).project;
    await page.waitForTimeout(250);
    expect((await scene(page)).project).toEqual(original);
    await page.getByRole('button', { name: 'Record camera move', exact: true }).click();
    await page.waitForTimeout(650);
    await page.getByRole('button', { name: /Stop & save/ }).click();
    const recorded = await scene(page), clip = recorded.project.clips[0];
    expect(recorded.phoneControl).toBe(false);
    expect(clip.name).toBe('Phone camera take'); expect(clip.tracks).toHaveLength(2);
    expect(clip.tracks[0].keys.length).toBeGreaterThan(10);
    expect(clip.tracks[0].keys.at(-1).value).not.toEqual(clip.tracks[0].keys[0].value);
    expect(recorded.project.objects).toEqual(original.objects);
    await expect.poll(() => previews).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Close phone camera', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await scene(page)).project).toEqual(original);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.getByRole('button', { name: 'Animate', exact: true }).click();
    await page.screenshot({ path: 'test-results/phone-camera-take.png', fullPage: true });
    await page.reload(); expect((await scene(page)).project.clips[0]).toEqual(clip);
    expect(errors).toEqual([]);
  } finally { sender.close(); }
});

test('limited tracking stops and saves the captured portion without reconnect jumps', async ({ page }) => {
  const sender = await pair(page);
  try {
    await page.getByRole('button', { name: 'Set starting pose', exact: true }).click();
    await page.getByRole('button', { name: 'Record camera move', exact: true }).click();
    await page.waitForTimeout(300); sender.limited();
    await expect(page.getByText(/Tracking is limited\. The captured portion/)).toBeVisible();
    expect((await scene(page)).phoneControl).toBe(false);
    expect((await scene(page)).project.clips).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Record camera move', exact: true })).toBeDisabled();
    await page.screenshot({ path: 'test-results/phone-camera-panel.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const brand = (await page.locator('.brand').boundingBox())!, actions = (await page.locator('.header-actions').boundingBox())!;
    expect(brand.x + brand.width).toBeLessThanOrEqual(actions.x);
    await page.screenshot({ path: 'test-results/phone-camera-mobile.png', fullPage: true });
  } finally { sender.close(); }
});

test('leaving during a take immediately persists the captured motion', async ({ page }) => {
  const sender = await pair(page);
  try {
    await page.getByRole('button', { name: 'Set starting pose', exact: true }).click();
    await page.getByRole('button', { name: 'Record camera move', exact: true }).click();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('take-one-scene-v1')!));
    expect(saved.clips).toHaveLength(1);
    await page.reload(); expect((await scene(page)).project.clips).toEqual(saved.clips);
  } finally { sender.close(); }
});

test('compares actual JPEG and WebRTC pixels, measures 20 pulses and cleans up on switching', async ({ page, browser }) => {
  test.setTimeout(90000);
  const sender = await pair(page), receiver = await browser.newPage();
  const errors: string[] = [], diagnostics: PhoneDiagnostics[] = [];
  receiver.on('pageerror', error => errors.push(error.message));
  await receiver.exposeFunction('nativeMessage', (message: { type: string }) => {
    if (message.type === 'receiver-ready') sender.phone.send(JSON.stringify({ type: 'preview-ready', version: 1 }));
    else { if (message.type === 'diagnostics') diagnostics.push(message as PhoneDiagnostics); sender.phone.send(JSON.stringify(message)); }
  });
  await receiver.addInitScript(() => {
    Object.assign(window, { webkit: { messageHandlers: { receiver: { postMessage: (value: unknown) => window.nativeMessage(value) } } } });
  });
  sender.phone.on('message', (data, binary) => {
    const message = binary ? { type: 'jpeg', data: data.toString('base64') } : JSON.parse(data.toString());
    if (['jpeg', 'preview-config', 'signal', 'render-stats'].includes(message.type)) void receiver.evaluate(value => window.receiver.accept(value), message).catch(() => {});
  });
  try {
    await receiver.goto('http://127.0.0.1:5174/phone-receiver.html');
    await expect(receiver.locator('#hud')).toBeHidden();
    await expect(receiver.getByRole('alert')).toBeHidden();
    await receiver.evaluate(() => window.receiver.accept({ type: 'debug', enabled: true }));
    await expect(receiver.locator('#hud')).toBeVisible();
    await page.getByRole('button', { name: 'Phone camera options' }).click();
    await page.getByRole('menuitemradio', { name: 'Debug information' }).click();
    await page.getByRole('button', { name: 'Set starting pose', exact: true }).click();
    const pulse = receiver.getByRole('button', { name: 'Run 20 latency pulses' });
    await expect(pulse).toBeEnabled(); await pulse.click();
    await expect.poll(() => diagnostics.at(-1)?.samples.length, { timeout: 20000 }).toBe(20);
    expect(diagnostics.at(-1)?.timedOut).toBe(0);
    await page.getByRole('combobox', { name: 'Preview mode' }).selectOption('webrtc');
    await expect(receiver.locator('#video')).toBeVisible();
    await expect.poll(() => diagnostics.at(-1)?.fps, { timeout: 15000 }).toBeGreaterThan(0);
    expect(await receiver.locator('video').evaluate(el => (el as HTMLVideoElement).srcObject instanceof MediaStream && ((el as HTMLVideoElement).srcObject as MediaStream).getAudioTracks().length)).toBe(0);
    await expect(pulse).toBeEnabled(); await pulse.click();
    await expect.poll(() => diagnostics.at(-1)?.samples.length, { timeout: 20000 }).toBe(20);
    expect(diagnostics.at(-1)?.timedOut).toBe(0);
    await page.getByRole('button', { name: 'Record camera move', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Stop & save/ }).click();
    expect((await scene(page)).project.clips).toHaveLength(1);
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export latency results' }).click();
    expect((await download).suggestedFilename()).toContain('webrtc');
    await page.getByRole('combobox', { name: 'Preview mode' }).selectOption('jpeg');
    await expect(receiver.locator('#video')).toBeHidden();
    expect(await receiver.locator('video').evaluate(el => (el as HTMLVideoElement).srcObject)).toBeNull();
    await expect(receiver.locator('#jpeg')).toBeVisible();
    await expect(pulse).toBeEnabled(); await pulse.click();
    await receiver.evaluate(() => window.receiver.accept({ type: 'debug', enabled: false }));
    await expect(receiver.locator('#hud')).toBeHidden();
    await expect.poll(() => diagnostics.at(-1)?.status).toContain('stopped');
    // Playback problems remain actionable even when the stats are hidden.
    await receiver.evaluate(async () => {
      Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, configurable: true });
      await window.receiver.accept({ type: 'preview-config', version: 1, mode: 'webrtc', fps: 60, streamId: crypto.randomUUID() });
    });
    await expect(receiver.getByRole('alert')).toHaveText('WebRTC is unavailable in this web view.');
    await expect(receiver.getByRole('alert')).toBeVisible();
    await expect(receiver.locator('#hud')).toBeHidden();
    expect(errors).toEqual([]);
  } finally { sender.close(); await receiver.close(); }
});
