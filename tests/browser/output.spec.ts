import { expect, test, type Page } from '@playwright/test';

async function scene(page: Page) {
  return page.evaluate(async () => { const path = '/src/core/store.ts'; return structuredClone((await import(path)).studio.get().project); });
}
async function openOutput(page: Page) {
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Output', exact: true }).click();
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
  await expect(page.getByRole('button', { name: '2 Direction' })).toBeDisabled();
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
  await expect(output).toBeInViewport(); await output.click();
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
  await page.getByRole('button', { name: 'Output', exact: true }).click();
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
  await page.getByRole('button', { name: 'Output', exact: true }).click(); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await page.getByRole('textbox', { name: 'Video instructions' }).fill('Natural light');
  await expect(page.getByText('reduce the reference images to nine or fewer', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '3 Generate' })).toBeDisabled();
});

test('generates and downloads images in output, selects video references, and keeps them across preview exports', async ({ page }) => {
  test.setTimeout(90000);
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await expect(page.locator('.output-services img')).toHaveCount(2);
  const colors = await page.locator('.output-shell').evaluate(node => { const style = getComputedStyle(node); return { accent: style.getPropertyValue('--accent').trim(), text: style.getPropertyValue('--text').trim() }; });
  expect(colors.accent).toBe(colors.text);
  await page.getByRole('textbox', { name: 'Image prompt', exact: true }).fill('A sunlit room with oak furniture');
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Generated image 1', exact: true })).toBeVisible({ timeout: 15000 });
  const generated = await scene(page), assetId = generated.generation.imageAssetIds[0];
  expect(generated.objects).toHaveLength(1);
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download image 1' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole('checkbox', { name: 'Use for video' }).check();
  expect((await scene(page)).generation.referenceAssetIds).toEqual([assetId]);
  await page.getByRole('textbox', { name: 'Video instructions' }).fill('Use the room reference and follow the composition');
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/output-images-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/output-images-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to preview' }).click();
  await page.getByRole('button', { name: 'Create new preview' }).click();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled({ timeout: 30000 });
  expect((await scene(page)).generation.imageAssetIds).toEqual([assetId]);
  expect((await scene(page)).generation.referenceAssetIds).toEqual([assetId]);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await page.getByRole('button', { name: 'Continue to generation' }).click();
  const sending = page.waitForRequest(request => request.url().endsWith('/api/jobs') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Generate with Seedance' }).click();
  expect((await sending).postDataJSON().project.generation.referenceAssetIds).toEqual([assetId]);
  await expect(page.getByRole('link', { name: 'Download video', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await scene(page)).generation.imageAssetIds).toEqual([assetId]);
});

test('an image request survives a lost response and reload without another provider submission', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const submissions: string[] = [];
  await page.route('**/api/image-jobs', async route => { submissions.push(route.request().postDataJSON().id); await route.fetch(); await route.abort('failed'); });
  await page.getByRole('textbox', { name: 'Image prompt', exact: true }).fill('Image recovery test');
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  const id = (await scene(page)).generation.imageRequest.id;
  await expect(page.getByRole('img', { name: 'Generated image 1', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('alert')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'I’ve reviewed this composition' })).toBeEnabled();
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await expect(page.getByRole('img', { name: 'Generated image 1', exact: true })).toBeVisible({ timeout: 15000 });
  expect(submissions).toEqual([id]);
});

test('image provider failures offer a deliberate new request and preserve the composition', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  const before = await scene(page);
  await page.getByRole('textbox', { name: 'Image prompt', exact: true }).fill('FAIL_IMAGE_TEST');
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Test image generation failed');
  await page.getByRole('button', { name: 'Start another image' }).click();
  await page.getByRole('textbox', { name: 'Image prompt', exact: true }).fill('A new image');
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Generated image 1', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await scene(page)).objects).toEqual(before.objects);
  expect((await scene(page)).generation.guideAssetId).toBe(before.generation.guideAssetId);
});

test('unsubmitted image requests and definitive rejections do not block video output', async ({ page }) => {
  await openOutput(page); await createPreview(page);
  await page.getByRole('checkbox', { name: 'I’ve reviewed this composition' }).check();
  await page.getByRole('button', { name: 'Continue to video direction' }).click();
  await page.getByRole('textbox', { name: 'Video instructions' }).fill('Follow the composition');
  await page.getByRole('textbox', { name: 'Image prompt', exact: true }).fill('Optional image');
  let submissions = 0;
  page.on('request', request => { if (request.url().endsWith('/api/image-jobs') && request.method() === 'POST') submissions++; });
  await page.route('**/api/projects/*', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { error: { code: 'SAVE_FAILED', message: 'Project save failed' } } }) : route.continue());
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Project save failed');
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeEnabled();
  expect((await scene(page)).generation.imageRequest).toBeUndefined();
  expect(submissions).toBe(0);
  await page.unroute('**/api/projects/*');
  await page.route('**/api/image-jobs', route => route.fulfill({ status: 503, json: { error: { code: 'GEMINI_NOT_CONFIGURED', message: 'Connect Gemini on the server to generate images.' } } }));
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connect Gemini');
  await expect(page.getByRole('button', { name: 'Continue to generation' })).toBeEnabled();
  expect((await scene(page)).generation.imageRequest).toBeUndefined();
  expect(submissions).toBe(1);
});
