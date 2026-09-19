import { expect, test, type Page } from '@playwright/test';
import { makeCamera, makeObject, makeProject, putKey } from '../../src/core/project';

async function scene(page: Page) {
  return page.evaluate(async () => { const path = '/src/core/store.ts'; return structuredClone((await import(path)).studio.get().project); });
}
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(name);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
}

test('home creates, names, saves and reopens independent projects in a fresh browser', async ({ page, request, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await create(page, 'Courtyard study');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add box', exact: true }).click();
  const first = await scene(page);
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(page.getByRole('button', { name: 'Open project Courtyard study', exact: true })).toBeVisible();
  expect((await request.get(`/api/projects/${first.id}`)).ok()).toBeTruthy();
  await create(page, 'Evening light');
  const second = await scene(page); expect(second.id).not.toBe(first.id); expect(second.objects).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Scene menu', exact: true }).click();
  await page.getByRole('button', { name: 'Rename project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Evening light / final');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  const fresh = await browser.newPage();
  try {
    await fresh.goto('/');
    await expect(fresh.getByRole('button', { name: 'Continue editing' })).toHaveCount(0);
    await fresh.getByRole('textbox', { name: 'Search projects' }).fill('courtyard');
    await fresh.getByRole('button', { name: 'Open project Courtyard study', exact: true }).click();
    await expect.poll(() => scene(fresh)).toEqual(first);
    await expect(fresh.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await fresh.getByRole('button', { name: 'Back to projects' }).click();
    await fresh.getByRole('textbox', { name: 'Search projects' }).fill('does-not-exist');
    await expect(fresh.getByRole('heading', { name: 'No matching projects' })).toBeVisible();
    await fresh.getByRole('button', { name: 'Clear search' }).click();
    await fresh.getByRole('button', { name: 'Sort projects' }).click();
    await fresh.getByRole('menuitemradio', { name: 'Name A–Z' }).click();
    await expect(fresh.getByRole('img', { name: 'Preview of Courtyard study' })).toBeVisible();
    await fresh.screenshot({ path: 'test-results-projects/projects-desktop.png', fullPage: true, animations: 'disabled' });
  } finally { await fresh.close(); }
  expect(errors).toEqual([]);
});

test('saved motion, scene camera and old browser drafts remain recoverable', async ({ page, request }) => {
  let project = { ...makeProject(), name: 'Camera and motion study', camera: makeCamera() };
  project.objects.push(makeObject('box'));
  project = putKey(project, 'model', 'position', 3, [2, 1, 0]) as typeof project;
  await request.put(`/api/projects/${project.id}`, { data: project });
  await page.goto('/');
  await page.getByRole('button', { name: `Open project ${project.name}` }).click();
  await expect.poll(() => scene(page)).toEqual(project);
  await page.evaluate(async () => { const path = '/src/core/store.ts'; (await import(path)).studio.rename('Recovered browser draft'); });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Quick access projects' })).toContainText('Recovered browser draft');
  await page.getByRole('link', { name: 'Recovered browser draft', exact: true }).click();
  await expect.poll(async () => (await scene(page)).name).toBe('Recovered browser draft');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/projects/${project.id}`)).json()).name).toBe('Recovered browser draft');
  await page.reload();
  await expect.poll(async () => (await scene(page)).tracks).toEqual(project.tracks);
});

test('save failure keeps the editor and draft; retry then returns home', async ({ page }) => {
  await page.goto('/'); await create(page, 'Save retry test');
  const before = await scene(page);
  await page.route('**/api/projects/*', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, json: { error: { code: 'WRITE_FAILED', message: 'Disk unavailable. Try again.' } } }) : route.continue());
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(page.locator('.status-message')).toContainText('Could not save project');
  await expect(page).toHaveURL(/#editor$/);
  expect(await scene(page)).toEqual(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('take-one-scene-v1')!).id)).toBe(before.id);
  await page.unroute('**/api/projects/*');
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
});

test('importing scene JSON preserves the current project before opening the imported scene', async ({ page, request }) => {
  await page.goto('/'); await create(page, 'Before file import');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add box', exact: true }).click();
  const original = await scene(page);
  const incoming = { ...makeProject(), name: 'Imported scene' };
  await page.getByLabel('Import scene JSON').setInputFiles({ name: 'scene.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await expect.poll(() => scene(page)).toEqual(incoming);
  expect(await (await request.get(`/api/projects/${original.id}`)).json()).toEqual(original);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('home handles loading failures, empty projects and mobile creation without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/projects', route => route.fulfill({ status: 503, json: { error: { message: 'Project server is unavailable.' } } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Project server is unavailable');
  await expect(page.getByRole('heading', { name: 'Your first take starts here' })).toHaveCount(0);
  await page.unroute('**/api/projects');
  await page.route('**/api/projects', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your first take starts here' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue editing' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results-projects/projects-empty-mobile.png', fullPage: true });
  await page.unroute('**/api/projects');
  await create(page, 'Mobile composition');
  await page.getByRole('button', { name: 'Save current project' }).click();
  await expect(page.locator('.status-message')).toContainText('Project saved');
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(page.getByRole('button', { name: 'Open project Mobile composition' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('img', { name: 'Preview of Mobile composition' })).toBeVisible();
  await page.screenshot({ path: 'test-results-projects/projects-mobile.png', fullPage: true, animations: 'disabled' });
});

test('sidebar filters real scene previews and interactions respect reduced motion', async ({ page, request }) => {
  const props = { ...makeProject(), name: 'Preview · Spatial study', objects: [makeObject('box'), { ...makeObject('box', 1), dimensions: [1, 2, 1] as [number, number, number] }] };
  let animated = { ...makeProject(), name: 'Preview · Movement study' };
  animated.objects[0].appearance = 'spider';
  animated = putKey(animated, 'arm.L', 'rotation', 0, [0, 0, -70]);
  await request.put(`/api/projects/${props.id}`, { data: props });
  await request.put(`/api/projects/${animated.id}`, { data: animated });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search projects' }).fill('Preview ·');
  const first = page.getByRole('img', { name: `Preview of ${props.name}` });
  const second = page.getByRole('img', { name: `Preview of ${animated.name}` });
  await expect(first).toHaveJSProperty('naturalWidth', 640);
  await expect(second).toHaveJSProperty('naturalWidth', 640);
  expect(await first.getAttribute('src')).not.toBe(await second.getAttribute('src'));
  const card = page.getByRole('button', { name: `Open project ${animated.name}`, exact: true });
  await card.hover();
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).transform)).not.toBe('none');
  expect(await second.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0.65s');
  await page.screenshot({ path: 'test-results-projects/projects-sidebar-grid.png', animations: 'disabled', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await second.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  expect(await card.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.getByRole('button', { name: 'Animated', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search projects' }).fill('Preview ·');
  await expect(page.getByRole('button', { name: `Open project ${props.name}`, exact: true })).toHaveCount(0);
  await expect(card).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search projects' }).fill('Preview ·');
  await expect(first).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results-projects/projects-sidebar-mobile.png', animations: 'disabled', fullPage: true });
});

test('preview images retain distant geometry and active web effects', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const previewPath = '/src/scene/projectPreview.ts', snapshotPath = '/src/core/projectPreview.ts', projectPath = '/src/core/project.ts';
    const { renderProjectPreview } = await import(previewPath);
    const { projectPreview } = await import(snapshotPath);
    const { makeProject, makeObject, HUMANOID_ID } = await import(projectPath);
    const wide = makeProject();
    wide.objects = [-300, 300].map((x, index) => ({ ...makeObject('box', index), position: [x, 0, 0], dimensions: [20, 20, 20], scale: [4, 4, 4] }));
    const signal = new AbortController().signal;
    const wideImage = await renderProjectPreview('wide-scene-regression', projectPreview(wide), signal);
    const image = new Image(); image.src = wideImage; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 640, 360).data;
    let min = 255, max = 0;
    for (let index = 0; index < pixels.length; index += 4) { min = Math.min(min, pixels[index]); max = Math.max(max, pixels[index]); }
    const character = makeProject();
    const withoutWeb = await renderProjectPreview('without-web-regression', projectPreview(character), signal);
    character.clips = [{ id: 'web', name: 'Swing', objectId: HUMANOID_ID, source: 'edited', start: 0, duration: 2, sourceDuration: 2, sourceStart: 0, sourceEnd: 2, tracks: [], web: { anchor: [3, 4, 0], start: 0, end: 2 } }];
    const withWeb = await renderProjectPreview('with-web-regression', projectPreview(character), signal);
    return { range: max - min, hasWeb: withWeb !== withoutWeb };
  });
  expect(result.range).toBeGreaterThan(25);
  expect(result.hasWeb).toBe(true);
});

test('project title links, neutral sorting menu and direct project output work', async ({ page, request }) => {
  const first = { ...makeProject(), name: 'Quick link project' }, second = { ...makeProject(), name: 'Direct output project' };
  await request.put(`/api/projects/${first.id}`, { data: first });
  await request.put(`/api/projects/${second.id}`, { data: second });
  await page.goto('/');
  await expect(page.getByText('Your creative space')).toHaveCount(0);
  await expect(page.getByText('Make room for your next idea.')).toHaveCount(0);
  await expect(page.locator('.project-total, .sidebar-resume, .home-footer')).toHaveCount(0);
  await page.getByRole('link', { name: first.name, exact: true }).click();
  await expect.poll(async () => (await scene(page)).id).toBe(first.id);
  await page.getByRole('button', { name: 'Back to projects' }).click();
  const sort = page.getByRole('button', { name: 'Sort projects', exact: true });
  await sort.focus(); await sort.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Last edited' })).toBeFocused();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(sort).toContainText('Name A–Z');
  await expect(sort).toBeFocused();
  const outline = await sort.evaluate(element => getComputedStyle(element).outlineColor);
  expect(outline).toBe('oklch(0.64 0.01 90)');
  await sort.click(); await page.keyboard.press('Tab');
  await expect(page.getByRole('menu', { name: 'Sort projects' })).toHaveCount(0);
  await sort.click();
  await page.screenshot({ path: 'test-results-projects/project-sort-menu.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `Project actions for ${second.name}` }).click();
  await page.screenshot({ path: 'test-results-projects/project-actions-menu.png', animations: 'disabled' });
  await page.getByRole('menuitem', { name: 'Output', exact: true }).click();
  await expect(page).toHaveURL(/#output$/);
  await expect(page.getByRole('heading', { name: 'Output', exact: true })).toBeVisible();
  await expect(page.locator('.output-title')).toContainText(second.name);
  expect((await scene(page)).id).toBe(second.id);
});

test('deletion can be cancelled and retried, then stays deleted after reload and creating another project', async ({ page, request }) => {
  await page.goto('/'); await create(page, 'Delete menu test');
  const project = await scene(page);
  await page.getByRole('button', { name: 'Back to projects' }).click();
  const action = page.getByRole('button', { name: 'Project actions for Delete menu test' });
  await action.click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(200);
  await page.route(`**/api/projects/${project.id}`, route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 500, json: { error: { message: 'Could not delete. Try again.' } } }) : route.continue());
  await action.click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not delete');
  expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(200);
  await page.unroute(`**/api/projects/${project.id}`);
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Open project Delete menu test', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Delete menu test', exact: true })).toHaveCount(0);
  expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(404);
  await page.reload();
  await create(page, 'After deletion');
  expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(404);
});
