import { expect, test, type Page } from '@playwright/test';

async function scene(page: Page) {
  return page.evaluate(async () => { const module = '/src/core/store.ts'; const { studio } = await import(module); return structuredClone(studio.get().project); });
}
async function ready(page: Page) { await page.goto('/#editor'); await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false'); }

test('multiple objects edit and animate independently, survive save/reopen, and deletion is undoable', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => { const module = '/src/core/store.ts'; (await import(module)).studio.rename('Object persistence test'); });
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add box', exact: true }).click(); await page.getByRole('button', { name: 'Add box', exact: true }).click();
  await page.getByRole('button', { name: /Box 1.*Static/ }).click();
  const x = page.getByRole('spinbutton', { name: 'position X', exact: true }); await x.fill('0'); await x.press('Enter');
  await page.getByRole('spinbutton', { name: 'Pose time', exact: true }).fill('5'); await x.fill('3'); await x.press('Enter');
  await page.getByRole('button', { name: 'Objects', exact: true }).click(); await page.getByRole('button', { name: /Box 2.*Static/ }).click();
  await expect(x).toHaveValue('2.75');
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  const rotation = page.getByRole('spinbutton', { name: 'rotation Y', exact: true }); await rotation.fill('90'); await rotation.press('Enter');
  await page.getByText('Object details', { exact: true }).click();
  const width = page.getByRole('spinbutton', { name: 'Width', exact: true }); await width.fill('2'); await width.press('Tab');
  const before = await scene(page); expect(before.objects).toHaveLength(3); expect(before.tracks).toHaveLength(2);
  expect(before.tracks[0].objectId).not.toBe(before.tracks[1].objectId);
  await page.getByRole('button', { name: 'Scene menu', exact: true }).click(); await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.locator('.status-message')).toContainText('Project saved');
  await page.getByRole('button', { name: 'Delete object', exact: true }).click(); expect((await scene(page)).objects).toHaveLength(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await scene(page)).toEqual(before);
  await page.getByRole('button', { name: 'Scene menu', exact: true }).click(); await page.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await page.getByRole('button', { name: /Object persistence test/ }).click(); await expect.poll(() => scene(page)).toEqual(before);
});

test('Delete removes only the selected key; saved scaled objects spawn at the same size with no motion', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'Objects', exact: true }).click(); await page.getByRole('button', { name: 'Add box', exact: true }).click();
  await page.getByRole('button', { name: /Box 1.*Static/ }).click(); await page.getByRole('button', { name: 'Scale', exact: true }).click();
  const scale = page.getByRole('spinbutton', { name: 'scale X', exact: true }); await scale.fill('2'); await scale.press('Enter');
  await page.getByText('Object details', { exact: true }).click(); await page.getByRole('button', { name: 'Save object', exact: true }).click();
  await expect(page.locator('.status-message')).toContainText('Object saved');
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  const key = page.getByRole('button', { name: 'Scale key at 0.00 seconds' }); await key.focus(); await key.press('Enter'); await key.press('Delete');
  expect((await scene(page)).objects).toHaveLength(2); expect((await scene(page)).tracks).toHaveLength(0);
  await page.getByRole('button', { name: 'Objects', exact: true }).click(); await page.getByRole('button', { name: 'Spawn', exact: true }).click();
  const spawned = await scene(page); expect(spawned.objects.at(-1).scale).toEqual([2, 1, 1]); expect(spawned.tracks).toHaveLength(0);
});

test('mocked prompt → spawn → movement → actual guide capture → mocked Seedance → download', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page); await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await page.getByRole('textbox', { name: 'AI prompt' }).fill('An oak plinth'); await page.getByRole('button', { name: 'Create suggestion', exact: true }).click();
  await expect(page.getByRole('img', { name: /reference concept/ })).toBeVisible();
  await page.getByRole('button', { name: 'Preview in scene' }).click(); expect((await scene(page)).objects).toHaveLength(1);
  await page.getByRole('button', { name: 'Spawn', exact: true }).click(); expect((await scene(page)).objects).toHaveLength(2);
  await page.getByRole('tab', { name: 'Movement' }).click(); await page.getByRole('textbox', { name: 'AI prompt' }).fill('Move right and back');
  await page.getByRole('button', { name: 'Create suggestion', exact: true }).click(); await page.getByRole('button', { name: 'Preview in scene' }).click();
  await page.getByRole('button', { name: 'Add animation block' }).click(); const animated = await scene(page); expect(animated.clips).toHaveLength(1);
  expect(animated.clips[0].tracks).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await scene(page)).clips ?? []).toHaveLength(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect((await scene(page)).clips).toHaveLength(1);
  await page.screenshot({ path: 'test-results/ai-panel-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Output', exact: true }).click(); await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  const guide = page.getByLabel('Guide preview', { exact: true }); await expect(guide).toBeVisible({ timeout: 90000 });
  await expect.poll(() => guide.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  expect(await guide.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(1280);
  expect(await guide.evaluate((video: HTMLVideoElement) => video.videoHeight)).toBe(720);
  expect(await guide.evaluate((video: HTMLVideoElement) => video.duration)).toBeCloseTo(5, 2);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check(); await page.getByRole('button', { name: 'Continue to video direction' }).click(); await page.getByRole('textbox', { name: 'Video instructions' }).fill('Natural oak, afternoon light'); await page.getByRole('button', { name: 'Continue to generation' }).click();
  await page.getByRole('button', { name: 'Generate with Seedance' }).click(); await expect(page.getByRole('link', { name: 'Download video', exact: true })).toBeVisible({ timeout: 20000 });
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download video', exact: true }).click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/output-.*\.mp4/); await download.saveAs('test-results/mock-generated-video.mp4');
  const finished = await scene(page); expect(finished.generation.outputAssetId).toBeTruthy();
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await scene(page)).generation).toEqual(finished.generation);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect((await scene(page)).generation).toEqual(finished.generation);
  await page.reload(); await page.getByRole('button', { name: 'Output', exact: true }).click(); await expect(page.getByRole('link', { name: 'Download video', exact: true })).toBeVisible();
  expect((await scene(page)).objects[1].referenceAssetIds).toEqual(animated.objects[1].referenceAssetIds);
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await page.evaluate(async () => { const path = '/src/core/store.ts'; (await import(path)).studio.duration(10); });
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByText('This request uses an earlier version', { exact: false })).toBeVisible();
  await expect(page.locator('.output-summary')).toContainText('5s · 720p · 16:9');
  await expect(page.locator('.output-preview-heading')).toContainText('5s · 720p · 16:9');
  await page.screenshot({ path: 'test-results/video-panel-desktop.png', fullPage: true }); expect(errors).toEqual([]);
});

test('invalid edited suggestions cannot mutate the scene and mobile AI is a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await ready(page); const before = await scene(page);
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click(); await page.getByRole('tab', { name: 'Movement' }).click();
  await page.getByRole('textbox', { name: 'AI prompt' }).fill('Nod'); await page.getByRole('button', { name: 'Create suggestion', exact: true }).click();
  await page.getByRole('textbox', { name: 'Suggestion JSON' }).fill('{"kind":"movement","tracks":[]}'); await page.getByRole('button', { name: 'Preview in scene' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid suggestion'); expect(await scene(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Add animation block' })).toBeDisabled();
  const panel = await page.getByRole('complementary', { name: 'AI assistant' }).boundingBox(); expect(panel!.y).toBeGreaterThan(250); expect(panel!.width).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-panel-mobile.png', fullPage: true });
});

test('a lost generation response survives reload without a second paid submission', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'Mannequin', exact: true }).click();
  const x = page.getByRole('spinbutton', { name: 'position X', exact: true }); await x.fill('0.5'); await x.press('Enter');
  await page.getByRole('button', { name: 'Output', exact: true }).click(); await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check(); await page.getByRole('button', { name: 'Continue to video direction' }).click(); await page.getByRole('textbox', { name: 'Video instructions' }).fill('Lost-response recovery test'); await page.getByRole('button', { name: 'Continue to generation' }).click();
  const submitted: string[] = [];
  await page.route('**/api/jobs', async route => { submitted.push(route.request().postDataJSON().id); await route.fetch(); await route.abort('failed'); });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name: 'Generate with Seedance' }).click();
  await expect(page.getByRole('alert')).toContainText('No video request was sent'); expect(submitted).toEqual([]);
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole('button', { name: 'Retry same request' }).click();
  await expect.poll(() => submitted.length).toBe(1);
  const id = (await scene(page)).generation.jobId; expect(id).toBe(submitted[0]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('take-one-scene-v1')!).generation.jobId)).toBe(id);
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await scene(page)).generation.jobId).toBe(id);
  await page.reload(); await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download video', exact: true })).toBeVisible({ timeout: 15000 });
  expect(submitted).toEqual([id]); expect((await scene(page)).generation.jobId).toBe(id);
});

test('switching projects during submission keeps the request in the original saved project', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => { const module = '/src/core/store.ts'; const { studio } = await import(module); studio.rename('Submission recovery'); });
  await page.getByRole('button', { name: 'Output', exact: true }).click(); await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check(); await page.getByRole('button', { name: 'Continue to video direction' }).click(); await page.getByRole('textbox', { name: 'Video instructions' }).fill('Project-switch recovery test'); await page.getByRole('button', { name: 'Continue to generation' }).click();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const submitted: string[] = [];
  await page.route('**/api/jobs', async route => {
    const response = await route.fetch(); submitted.push(route.request().postDataJSON().id);
    await held; await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Generate with Seedance' }).click();
  await expect.poll(() => submitted.length).toBe(1);
  const original = await scene(page);
  await page.evaluate(async () => { const storePath = '/src/core/store.ts', projectPath = '/src/core/project.ts'; const { studio } = await import(storePath), { makeProject } = await import(projectPath); studio.import(JSON.stringify(makeProject())); studio.persistNow(); });
  expect((await scene(page)).id).not.toBe(original.id);
  const response = page.waitForResponse(result => result.url().endsWith('/api/jobs') && result.request().method() === 'POST');
  release(); await response;
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await page.reload(); await page.getByRole('button', { name: 'Scene menu', exact: true }).click();
  await page.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await page.getByRole('button', { name: /Submission recovery/ }).click();
  await expect.poll(async () => (await scene(page)).generation?.jobId).toBe(submitted[0]);
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download video', exact: true })).toBeVisible({ timeout: 15000 });
  expect(submitted).toEqual([original.generation.jobId]);
});

test('a reference upload cannot attach to another project with the same humanoid ID', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'Mannequin', exact: true }).click(); await page.getByText('Object details', { exact: true }).click();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let uploaded = false;
  await page.route('**/api/assets?role=reference', async route => { const response = await route.fetch(); uploaded = true; await held; await route.fulfill({ response }); });
  await page.getByLabel('Add reference image', { exact: true }).setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64') });
  await expect.poll(() => uploaded).toBe(true);
  await page.evaluate(async () => { const storePath = '/src/core/store.ts', projectPath = '/src/core/project.ts'; const { studio } = await import(storePath), { makeProject } = await import(projectPath); studio.import(JSON.stringify(makeProject())); studio.selectObject('humanoid'); });
  release(); await page.waitForResponse(response => response.url().includes('/api/assets?role=reference'));
  expect((await scene(page)).objects[0].referenceAssetIds).toEqual([]);
});
