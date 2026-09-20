import { expect, test, type Page } from '@playwright/test';
import { HUMANOID_ID, makeProject, putKey } from '../../src/core/project';
import { animationFromTracks, insertClip, transformClip } from '../../src/core/clips';

async function state(page: Page) { return page.evaluate(async () => { const path = '/src/core/store.ts'; return (await import(path)).studio.get(); }); }
async function position(page: Page, time: number) { return page.evaluate(async time => {
  const p = '/src/core/project.ts', s = '/src/core/store.ts'; return (await import(p)).sample((await import(s)).studio.get().project, 'model', 'position', time);
}, time); }
async function setup(page: Page, clip = false) {
  let project = putKey(putKey({ ...makeProject(), duration: 4 }, 'model', 'position', 0, [0, 0, 0], 'linear'), 'model', 'position', 4, [4, 0, 0]);
  if (clip) {
    project = insertClip({ ...makeProject(), duration: 8 }, animationFromTracks(project, HUMANOID_ID, 'Landing', 'edited'), HUMANOID_ID, 1);
    project = transformClip(project, project.clips![0].id, 1, 6);
  }
  await page.addInitScript(value => { if (!localStorage.getItem('take-one-scene-v1')) localStorage.setItem('take-one-scene-v1', JSON.stringify(value)); }, project);
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  if (clip) await page.getByRole('button', { name: 'Landing animation block', exact: true }).dblclick();
  await page.getByLabel('Timeline mode', { exact: true }).selectOption('value');
}

for (const width of [1440, 390]) test(`value graph handle edits real property curves at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await expect(page.getByLabel('Value graph', { exact: true })).toBeVisible();
  const graphArea = (await page.locator('.value-content').boundingBox())!;
  const firstKey = (await page.getByRole('button', { name: 'Value key at 0.00 seconds', exact: true }).boundingBox())!;
  expect(firstKey.y + firstKey.height / 2).toBeLessThan(graphArea.y + graphArea.height);
  expect((await position(page, 2))[0]).toBe(2);
  await page.getByRole('button', { name: 'Value key at 4.00 seconds', exact: true }).press('Enter');
  const handle = page.getByRole('button', { name: 'Incoming value handle', exact: true });
  const bounds = (await handle.boundingBox())!, rail = (await page.getByLabel('Value graph', { exact: true }).boundingBox())!;
  const undoCount = (await state(page)).undoCount;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - rail.width * .3, bounds.y + bounds.height / 2, { steps: 8 }); await page.mouse.up();
  const edited = await state(page);
  expect(edited.undoCount).toBe(undoCount + 1);
  expect(edited.project.tracks[0].keys[1].valueHandles.in[0]).toBeCloseTo(1 / 3 + .3, 2);
  expect((await position(page, 2))[0]).toBeGreaterThan(2);
  expect((4 - (await position(page, 3.999))[0]) / .001).toBeLessThan(.002);
  expect((await position(page, 4))[0]).toBe(4);
  expect(edited.project.velocities).toBeUndefined();
  await page.keyboard.press('Control+z'); expect((await position(page, 2))[0]).toBe(2);
  await page.keyboard.press('Control+Shift+z'); expect((await position(page, 2))[0]).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Value key at 4.00 seconds', exact: true }).press('Enter');
  await page.getByLabel('Value key value', { exact: true }).fill('3'); await page.getByLabel('Value key value', { exact: true }).press('Enter');
  expect((await position(page, 4))[0]).toBe(3);
  await page.getByRole('button', { name: 'Y value axis', exact: true }).click();
  await expect(page.getByLabel('Value key value', { exact: true })).toHaveValue('0.00');
  await page.getByRole('button', { name: 'X value axis', exact: true }).click();
  await page.evaluate(async () => { const path = '/src/core/store.ts'; (await import(path)).studio.persistNow(); });
  await page.reload(); await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await page.getByLabel('Timeline mode', { exact: true }).selectOption('value');
  expect((await state(page)).project.tracks[0].keys[1].valueHandles.in[0]).toBeCloseTo(1 / 3 + .3, 2);
  await page.getByRole('button', { name: 'Value key at 4.00 seconds', exact: true }).press('Enter');
  const ruler = (await page.locator('.ruler-ticks').boundingBox())!;
  expect(rail.x).toBeCloseTo(ruler.x, 0); expect(rail.width).toBeCloseTo(ruler.width, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `test-results/value-graph-${width}.png` });
  await page.getByRole('button', { name: 'Incoming value handle', exact: true }).press('ArrowLeft');
  expect((await state(page)).project.tracks[0].keys[1].valueHandles.in[0]).toBeCloseTo(1 / 3 + .31, 2);
  await page.getByRole('button', { name: 'Reset value handles', exact: true }).click(); expect((await position(page, 2))[0]).toBe(1.5);
  expect(errors).toEqual([]);
});

test('value graph uses scene time inside a stretched clip', async ({ page }) => {
  await setup(page, true);
  await page.getByRole('button', { name: 'Value key at 6.00 seconds', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Incoming value handle', exact: true }).press('ArrowLeft');
  expect((await position(page, 4))[0]).toBeGreaterThan(2);
  expect((await state(page)).project.clips[0].tracks[0].keys[1].time).toBe(4);
  await page.getByLabel('Value key time', { exact: true }).fill('4.5'); await page.getByLabel('Value key time', { exact: true }).press('Enter');
  expect((await state(page)).project.clips[0].tracks[0].keys[1].time).toBe(3);
  expect((await state(page)).time).toBe(5.5);
  await page.getByRole('button', { name: 'Delete selected keyframe', exact: true }).click();
  expect((await state(page)).project.clips[0].tracks[0].keys).toHaveLength(1);
});

test('value keys stay visible when a zero velocity envelope pauses playback', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const path = '/src/core/store.ts', { studio } = await import(path), project = studio.get().project;
    studio.openProject({ ...project, velocities: [{ objectId: 'humanoid', duration: 4, keys: [{ id: 'stop', time: 0, speed: 0 }] }] });
    studio.patch({ timelineMode: 'value' });
  });
  const rail = (await page.getByLabel('Value graph', { exact: true }).boundingBox())!;
  const key = page.getByRole('button', { name: 'Value key at 4.00 seconds', exact: true });
  const bounds = (await key.boundingBox())!;
  expect(bounds.y + bounds.height / 2).toBeGreaterThan(rail.y);
  expect(bounds.y + bounds.height / 2).toBeLessThan(rail.y + rail.height);
  await key.click(); await expect(page.getByLabel('Value key value', { exact: true })).toHaveValue('4.00');
  expect((await position(page, 2))[0]).toBe(0);
});
