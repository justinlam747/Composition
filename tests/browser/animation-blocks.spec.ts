import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await page.getByRole('button', { name: 'Animations', exact: true }).click();
}
async function state(page: Page) { return page.evaluate(async () => { const path = '/src/core/store.ts'; return (await import(path)).studio.get(); }); }
async function loadDemo(page: Page) {
  await ready(page); await page.getByRole('button', { name: 'Load Spider-Man demo' }).click();
  await expect(page.getByRole('region', { name: 'Animation blocks timeline' })).toBeVisible();
  await expect(page.getByLabel('Camera frame', { exact: true })).toBeVisible();
}
test('the first cached block can be dragged into a fresh timeline', async ({ page }) => {
  await ready(page);
  const target = page.getByLabel('Mannequin animation track', { exact: true }), bounds = (await target.boundingBox())!;
  await page.locator('.animation-asset').filter({ hasText: 'Drop to floor' }).dragTo(target, { targetPosition: { x: bounds.width * .1, y: 30 } });
  expect((await state(page)).project.clips).toHaveLength(1);
  expect((await state(page)).project.clips[0].start).toBeCloseTo(.5, 1);
});
test('saved AI demo supports playback, block stretch, move and split with undo and persistence', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await loadDemo(page);
  expect((await state(page)).project.clips).toHaveLength(3);
  expect((await state(page)).project.clips.every((clip: { source: string }) => clip.source === 'ai')).toBe(true);
  await page.getByRole('button', { name: 'Play timeline', exact: true }).click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.2);
  await page.getByRole('button', { name: 'Pause timeline', exact: true }).click();
  const before = (await state(page)).project;
  const rail = (await page.getByLabel('Spider-Man demo animation track', { exact: true }).boundingBox())!;
  const edge = (await page.getByRole('button', { name: 'Resize end of Swing and land' }).boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2); await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 - rail.width / 10, edge.y + edge.height / 2, { steps: 6 }); await page.mouse.up();
  let project = (await state(page)).project;
  expect(project.clips[2].duration).toBeCloseTo(4.5, 1); expect(project.clips[2].tracks).toEqual(before.clips[2].tracks);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await state(page)).project.clips[2].duration).toBe(5.5);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const block = page.getByRole('button', { name: 'Swing and land animation block', exact: true });
  const bounds = (await block.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + rail.width / 20, bounds.y + bounds.height / 2, { steps: 6 }); await page.mouse.up();
  expect((await state(page)).project.clips[2].start).toBeCloseTo(4, 1);
  await page.getByRole('slider', { name: 'Timeline playhead' }).fill('6');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  project = (await state(page)).project; expect(project.clips).toHaveLength(4);
  expect(project.clips[2].sourceEnd).toBe(project.clips[3].sourceStart);
  await page.waitForTimeout(450); await page.reload();
  expect((await state(page)).project).toEqual(project);
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await page.getByRole('slider', { name: 'Timeline playhead' }).fill('5');
  await page.locator('.camera-switch').getByRole('button', { name: 'Camera view', exact: true }).click();
  await page.screenshot({ path: 'test-results-blocks/demo-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('double-click opens independent keys, velocity edits persist, and cached animations can be exported', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Drop to floor animation block', exact: true }).dblclick();
  await expect(page.getByRole('region', { name: 'Drop to floor keyframes', exact: true })).toBeVisible();
  const key = page.getByRole('button', { name: 'Position key at 0.70 seconds', exact: true });
  const keyId = (await state(page)).project.clips[0].tracks[0].keys.find((value: { time: number }) => Math.abs(value.time - .7) < .0001).id;
  await key.press('Enter');
  await key.press('ArrowRight'); expect((await state(page)).project.clips[0].tracks[0].keys.find((value: { id: string }) => value.id === keyId).time).toBeCloseTo(22 / 30);
  await page.getByRole('button', { name: 'Velocity timeline mode' }).click();
  await page.getByRole('button', { name: 'Add velocity key', exact: true }).click();
  await page.getByLabel('Velocity key speed', { exact: true }).fill('1.75');
  await page.getByLabel('Velocity key speed', { exact: true }).press('Enter');
  const velocityKeys = (await state(page)).project.clips[0].velocityKeys;
  expect(velocityKeys[0].speed).toBe(1.75);
  await page.getByRole('button', { name: 'All blocks', exact: true }).click();
  await page.getByRole('button', { name: 'Cache selected animation', exact: true }).click();
  await page.getByRole('button', { name: 'Animations', exact: true }).click();
  await expect(page.locator('.animation-asset')).toHaveCount(4);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export animation library' }).click();
  const download = await downloading; expect(download.suggestedFilename()).toBe('composition-animations.json');
  await download.saveAs('test-results-blocks/cached-animations.json');
  await page.reload(); await page.getByRole('button', { name: 'Animate', exact: true }).click(); await page.getByRole('button', { name: 'Animations', exact: true }).click();
  await expect(page.locator('.animation-asset')).toHaveCount(4);
  expect((await state(page)).project.clips[0].velocityKeys).toEqual(velocityKeys);
});

test('saved library blocks can be dragged into a track and remain independent from their source', async ({ page }) => {
  await loadDemo(page); await page.getByRole('button', { name: 'Swing and land animation block', exact: true }).click();
  await page.getByRole('button', { name: 'Delete animation block' }).click();
  await page.getByRole('button', { name: 'Animations', exact: true }).click();
  const target = page.getByLabel('Spider-Man demo animation track', { exact: true }); const bounds = (await target.boundingBox())!;
  await page.locator('.animation-asset').filter({ hasText: 'Swing and land' }).dragTo(target, { targetPosition: { x: bounds.width * .4, y: 30 } });
  expect((await state(page)).project.clips).toHaveLength(3);
  expect((await state(page)).project.clips[2].start).toBeCloseTo(4, 1);
});

test('mobile block timeline fits and exposes internal keys by button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await loadDemo(page);
  await page.getByRole('button', { name: 'Shoot web animation block', exact: true }).click();
  await page.getByRole('button', { name: 'Edit keyframes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Shoot web keyframes', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results-blocks/demo-mobile.png', fullPage: true });
});

test('the saved AI sequence exports a real guide video and renders its three actions', async ({ page }) => {
  test.setTimeout(120000); await loadDemo(page);
  for (const [name, time] of [['drop', '0.7'], ['web', '3'], ['swing', '5'], ['land', '9']] as const) {
    await page.getByRole('slider', { name: 'Timeline playhead' }).fill(time);
    await page.waitForTimeout(100);
    await page.getByRole('region', { name: 'Scene editor', exact: true }).screenshot({ path: `test-results-blocks/demo-${name}.png` });
  }
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  const guide = page.getByLabel('Guide preview', { exact: true }); await expect(guide).toBeVisible({ timeout: 90000 });
  await expect.poll(() => guide.evaluate(node => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  expect(await guide.evaluate(node => (node as HTMLVideoElement).videoWidth)).toBe(1280);
  expect(await guide.evaluate(node => (node as HTMLVideoElement).duration)).toBeCloseTo(10, 1);
  const downloading = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download composition MP4', exact: true }).click();
  await (await downloading).saveAs('test-results-blocks/spider-demo-guide.mp4');
});
