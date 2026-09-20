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
  const timer = setInterval(() => {
    if (phone.readyState === WebSocket.OPEN) phone.send(JSON.stringify({ type: 'pose', version: 1, seq: ++sequence, time: sequence / 30,
      tracking, position: [sequence / 300, 0, 0], quaternion: [0, 0, 0, 1] }));
  }, 34);
  await expect(page.getByText('Tracking ready', { exact: true })).toBeVisible();
  return { phone, limited: () => { tracking = 'limited'; }, close: () => { clearInterval(timer); phone.close(); } };
}

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
    expect(errors).toEqual([]);
  } finally { sender.close(); await receiver.close(); }
});
