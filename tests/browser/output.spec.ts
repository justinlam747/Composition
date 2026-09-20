import { expect, test, type Page } from '@playwright/test';

async function scene(page: Page) {
  return page.evaluate(async () => { const path = '/src/core/store.ts'; return structuredClone((await import(path)).studio.get().project); });
}
async function clickOutput(page: Page) {
  const output = page.getByRole('button', { name: 'Output', exact: true });
  if (!await output.isVisible()) await page.getByRole('button', { name: 'Scene menu' }).click();
  await output.click();
}
async function openOutput(page: Page) {
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await clickOutput(page);
  await expect(page).toHaveURL(/#output$/);
}
async function createPreview(page: Page) {
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled({ timeout: 30000 });
}

test('Output leaves the editor, gates the steps, and preserves the scene and framing on return', async ({ page }) => {
  await openOutput(page);
  await expect(page.getByRole('main', { name: 'Output workflow' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Objects', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Continue to video direction' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Direction', exact: true })).toBeDisabled();
  const before = await scene(page);
  await page.keyboard.press('k'); await page.keyboard.press('Delete'); await page.keyboard.press('Space');
  expect(await scene(page)).toEqual(before);
  expect(await page.evaluate(async () => { const path = '/src/core/store.ts'; return (await import(path)).studio.get().playing; })).toBe(false);
  await page.screenshot({ path: 'test-results/output-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await expect(page).toHaveURL(/#editor$/);
  expect(await scene(page)).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  const output = page.getByRole('button', { name: 'Output', exact: true });
  await clickOutput(page);
  await expect(page.getByRole('button', { name: 'Create preview', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/output-mobile.png', fullPage: true });
  await page.reload(); await expect(page.getByRole('heading', { name: 'Output', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
});

test('preview and direction survive navigation and reload, while scene edits require a fresh preview', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await page.getByRole('textbox', { name: 'Video instructions' }).fill('Soft daylight and natural materials');
  await page.getByRole('button', { name: 'Continue to generation' }).click();
  await expect(page.getByRole('button', { name: 'Generate with Seedance' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/output-ready.png', fullPage: true });
  const guide = (await scene(page)).generation.guideAssetId;
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continue to video direction' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await expect(page.getByRole('textbox', { name: 'Video instructions' })).toHaveValue('Soft daylight and natural materials');
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add box', exact: true }).click();
  await clickOutput(page);
  await expect(page.getByText('Your composition has changed.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to video direction' })).toBeDisabled();
  expect((await scene(page)).generation.guideAssetId).toBe(guide);
  await page.getByRole('button', { name: 'Create new preview' }).click();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled({ timeout: 30000 });
  expect((await scene(page)).generation.guideAssetId).not.toBe(guide);
  expect((await scene(page)).generation.instructions).toBe('Soft daylight and natural materials');
});

test('failed preview upload is actionable and retry uses real capture without starting a generation', async ({ page }) => {
  let fail = true, submissions = 0;
  await page.route('**/api/assets?role=guide*', route => fail ? route.fulfill({ status: 503, json: { error: { code: 'ENCODER_BUSY', message: 'Encoder is busy. Try again.' } } }) : route.continue());
  page.on('request', request => { if (request.url().endsWith('/api/jobs') && request.method() === 'POST') submissions++; });
  await openOutput(page);
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Encoder is busy', { timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Continue to video direction' })).toBeDisabled();
  fail = false; await createPreview(page);
  await expect(page.getByRole('alert')).toBeHidden();
  expect(submissions).toBe(0);
});

test('too many references cannot bypass video direction through the step navigation', async ({ page, request }) => {
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  const references = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
    const response = await request.post('/api/assets?role=reference', { headers: { 'Content-Type': 'image/png' }, data: Buffer.concat([png, Buffer.from([index])]) });
    return (await response.json()).id;
  }));
  expect(new Set(references).size).toBe(10);
  await page.evaluate(async ids => { const path = '/src/core/store.ts', corePath = '/src/core/project.ts'; const { studio } = await import(path); const { makeObject } = await import(corePath); const project = structuredClone(studio.get().project); project.objects[0].referenceAssetIds = ids.slice(0, 5); project.objects.push({ ...makeObject('box'), referenceAssetIds: ids.slice(5) }); studio.import(JSON.stringify(project)); }, references);
  await clickOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await page.getByRole('textbox', { name: 'Video instructions' }).fill('Natural light');
  await expect(page.getByText('Remove reference images to use nine or fewer', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
});

test('generates and downloads images in output, selects video references, and keeps them across preview exports', async ({ page }) => {
  test.setTimeout(90000);
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await expect(page.locator('.output-services img')).toHaveCount(2);
  const colors = await page.locator('.output-shell').evaluate(node => { const style = getComputedStyle(node); return { accent: style.getPropertyValue('--accent').trim(), text: style.getPropertyValue('--text').trim() }; });
  expect(colors.accent).toBe(colors.text);
  const direction = page.getByRole('textbox', { name: 'Video instructions', exact: true });
  await direction.fill('A sunlit room with oak furniture');
  await expect(page.locator('.output-layout > .output-images')).toBeVisible();
  await expect(page.locator('.output-direction-actions')).toContainText('Upload images');
  await expect(page.locator('.output-direction-actions')).toContainText('Continue');
  await page.getByRole('button', { name: 'Generate images', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Image 1 - First frame', exact: true })).toBeVisible({ timeout: 15000 });
  const generated = await scene(page), assetId = generated.generation.imageAssetIds[0];
  expect(generated.objects).toHaveLength(1);
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download image 1' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole('button', { name: 'Use image 1 as baseline' }).click();
  expect((await scene(page)).generation.baselineAssetId).toBe(assetId);
  const pairIds = (await scene(page)).generation.imageAssetIds;
  expect(pairIds).toHaveLength(2);
  await direction.fill('Use the room reference and follow the composition');
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/output-images-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/output-images-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to preview' }).click();
  await page.getByRole('button', { name: 'Create new preview' }).click();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled({ timeout: 30000 });
  expect((await scene(page)).generation.imageAssetIds).toEqual(pairIds);
  const afterExport = await scene(page);
  expect(afterExport.generation.baselineAssetId).toBe(afterExport.generation.guideAssetId === generated.generation.guideAssetId ? assetId : undefined);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const baselineButton = page.getByRole('button', { name: 'Use image 1 as baseline' });
  if (await baselineButton.isEnabled() && await baselineButton.getAttribute('aria-pressed') !== 'true') await baselineButton.click();
  await page.getByRole('button', { name: 'Continue to generation' }).click();
  const sending = page.waitForRequest(request => request.url().endsWith('/api/jobs') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Generate with Seedance' }).click();
  expect((await sending).postDataJSON().project.generation.imageAssetIds).toEqual(pairIds);
  await expect(page.getByRole('link', { name: 'Download video', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await scene(page)).generation.imageAssetIds).toEqual(pairIds);
});

test('an image request survives a lost response and reload without another provider submission', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const submissions: string[] = [];
  await page.route('**/api/image-jobs', async route => { submissions.push(route.request().postDataJSON().id); await route.fetch(); await route.abort('failed'); });
  await page.getByRole('textbox', { name: 'Video instructions', exact: true }).fill('Image recovery test');
  await page.getByRole('button', { name: 'Generate images', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  const id = (await scene(page)).generation.imageRequest.id;
  await expect(page.getByRole('img', { name: 'Image 1 - First frame', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('alert')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled();
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await expect(page.getByRole('img', { name: 'Image 1 - First frame', exact: true })).toBeVisible({ timeout: 15000 });
  expect(submissions).toEqual([id]);
});

test('image provider failures offer a deliberate new request and preserve the composition', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const before = await scene(page);
  await page.getByRole('textbox', { name: 'Video instructions', exact: true }).fill('FAIL_IMAGE_TEST');
  await page.getByRole('button', { name: 'Generate images', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Test image generation failed');
  await page.getByRole('button', { name: 'Start another image' }).click();
  await page.getByRole('textbox', { name: 'Video instructions', exact: true }).fill('A new image');
  await page.getByRole('button', { name: 'Generate images', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Image 1 - First frame', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await scene(page)).objects).toEqual(before.objects);
  expect((await scene(page)).generation.guideAssetId).toBe(before.generation.guideAssetId);
});

test('unsubmitted image requests and definitive rejections do not block video output', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await page.getByRole('textbox', { name: 'Video instructions' }).fill('Optional image');
  let submissions = 0;
  page.on('request', request => { if (request.url().endsWith('/api/image-jobs') && request.method() === 'POST') submissions++; });
  await page.route('**/api/projects/*', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { error: { code: 'SAVE_FAILED', message: 'Project save failed' } } }) : route.continue());
  await page.getByRole('button', { name: 'Generate images', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Project save failed');
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeEnabled();
  expect((await scene(page)).generation.imageRequest).toBeUndefined();
  expect(submissions).toBe(0);
  await page.unroute('**/api/projects/*');
  await page.route('**/api/image-jobs', route => route.fulfill({ status: 503, json: { error: { code: 'GEMINI_NOT_CONFIGURED', message: 'Connect Gemini on the server to generate images.' } } }));
  await page.getByRole('button', { name: 'Generate images', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connect Gemini');
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeEnabled();
  expect((await scene(page)).generation.imageRequest).toBeUndefined();
  expect(submissions).toBe(1);
});

test('uploads and removes input images, preserving deletion across reload', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: /reviewed this composition/ }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('Upload reference images').setInputFiles({ name: 'look.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('checkbox', { name: 'Use for video' })).toBeChecked();
  await expect(page.getByRole('img', { name: 'Video reference 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove video reference 1', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Use for video' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Use for video' }).check();
  await page.getByRole('button', { name: 'Remove image 1', exact: true }).click();
  await expect(page.locator('.output-image-grid figure')).toHaveCount(0);
  expect((await scene(page)).generation.referenceAssetIds).toEqual([]);
  await page.reload();
  await page.getByRole('checkbox', { name: /reviewed this composition/ }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await expect(page.locator('.output-image-grid figure')).toHaveCount(0);
});

test('optimizes and reoptimizes the shared direction field', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: /reviewed this composition/ }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const direction = page.getByRole('textbox', { name: 'Video instructions', exact: true });
  await direction.fill('Toy hero in a subway');
  const requests: { prompt: string; previous?: string }[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/output-prompts')) requests.push(request.postDataJSON()); });
  await page.getByRole('button', { name: 'Optimize video direction prompt' }).click();
  await expect(direction).toHaveValue(/Toy hero in a subway.*soft light/);
  await expect(page.getByRole('button', { name: 'Reoptimize video direction prompt' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reoptimize video direction prompt' }).click();
  expect(requests[1]).toMatchObject({ prompt: 'Toy hero in a subway', previous: expect.stringContaining('soft light') });
  await direction.fill('My edited cinematic direction');
  await expect(direction).toHaveValue('My edited cinematic direction');
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results-output/prompts-mobile.png', fullPage: true });
});

test('deleted generated frames stay removed after job polling on reload', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: /reviewed this composition/ }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await page.getByRole('textbox', { name: 'Video instructions', exact: true }).fill('Toy subway');
  await page.getByRole('button', { name: 'Generate images', exact: true }).click();
  await expect(page.locator('.output-image-grid figure')).toHaveCount(2);
  await page.getByRole('button', { name: 'Use image 1 as baseline' }).click();
  await expect(page.locator('.reference-strip img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove image 1', exact: true }).click();
  await expect(page.locator('.output-image-grid figure')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Use image 1 as baseline' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('checkbox', { name: /reviewed this composition/ }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await expect(page.locator('.output-image-grid figure')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Use for video' })).toBeVisible();
});

test('generates repeatedly from the optimized prompt and every upload without a count selector or gallery cap', async ({ page }) => {
  test.setTimeout(90000);
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: /reviewed this composition/ }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('Upload reference images').setInputFiles(Array.from({ length: 30 }, (_, i) => ({ name: `reference-${i}.png`, mimeType: 'image/png', buffer: Buffer.concat([png, Buffer.from(String(i))]) })));
  await expect(page.locator('.output-image-grid figure')).toHaveCount(30, { timeout: 30000 });
  const generate = page.getByRole('button', { name: 'Generate images', exact: true });
  const prompt = page.getByRole('textbox', { name: 'Video instructions', exact: true });
  await prompt.fill('Toy hero in a subway');
  await expect(generate).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Image options' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Use for video' }).first().uncheck();
  const uploadedIds = (await scene(page)).generation.uploadedImageAssetIds;
  expect(uploadedIds).toHaveLength(30);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/output-prompts', async route => { await held; await route.continue(); });
  await page.getByRole('button', { name: 'Optimize video direction prompt' }).click();
  await expect(generate).toBeDisabled();
  release();
  await expect(prompt).toHaveValue(/Toy hero in a subway.*soft light/);
  const optimized = await prompt.inputValue();
  for (let version = 0; version < 4; version++) {
    if (version) await prompt.fill(`${optimized} Variation ${version}.`);
    const expectedPrompt = await prompt.inputValue();
    const sending = page.waitForRequest(request => request.url().endsWith('/api/image-jobs') && request.method() === 'POST');
    await generate.click();
    const input = (await sending).postDataJSON();
    expect(input.prompt).toBe(expectedPrompt); expect(input.referenceAssetIds).toEqual(uploadedIds);
    expect(input.count).toBeUndefined(); expect(input.paired).toBe(true);
    await expect(page.locator('.output-image-grid figure')).toHaveCount(32 + version * 2);
    await expect(generate).toBeEnabled();
  }
  await page.screenshot({ path: 'test-results-output/unlimited-image-inputs.png', fullPage: true });
});
