import { expect, test, type Page } from '@playwright/test';
import { makeProject, putKey, HUMANOID_ID } from '../../src/core/project';
import { animationFromTracks, insertClip, transformClip } from '../../src/core/clips';

async function state(page: Page) { return page.evaluate(async () => { const path = '/src/core/store.ts'; return (await import(path)).studio.get(); }); }
async function setup(page: Page, block = false) {
  let project = putKey({ ...makeProject(), duration: 4 }, 'model', 'position', 0, [0, 0, 0], 'linear');
  project = putKey(project, 'model', 'position', 4, [4, 0, 0]);
  if (block) {
    const asset = animationFromTracks(project, HUMANOID_ID, 'Move', 'edited');
    project = insertClip({ ...makeProject(), duration: 10 }, asset, HUMANOID_ID, 1);
    project = transformClip(project, project.clips![0].id, 1, 6);
  }
  await page.addInitScript(value => { if (!localStorage.getItem('take-one-scene-v1')) localStorage.setItem('take-one-scene-v1', JSON.stringify(value)); }, project);
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  if (block) await page.getByRole('button', { name: 'Move animation block', exact: true }).dblclick();
  await page.getByRole('button', { name: 'Velocity timeline mode' }).click();
  return project;
}
async function speed(page: Page, value: string) {
  await page.getByLabel('Velocity key speed', { exact: true }).fill(value);
  await page.getByLabel('Velocity key speed', { exact: true }).press('Enter');
}

for (const width of [1440, 390]) test(`velocity-only timeline edits and retimes real independent keys at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const original = await setup(page);
  await expect(page.locator('.velocity-lane')).toHaveCount(1);
  await expect(page.locator('.timeline-lane')).toHaveCount(0);
  await expect(page.getByLabel('Keyframe interpolation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add velocity key', exact: true }).click();
  await expect(page.locator('.velocity-key')).toHaveCount(1);
  // Re-adding at the same time selects the existing speed key.
  await page.getByRole('button', { name: 'Add velocity key', exact: true }).click();
  await expect(page.locator('.velocity-key')).toHaveCount(1);
  await page.getByLabel('Timeline playhead', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Add velocity key', exact: true }).click(); await speed(page, '2');
  await page.getByRole('button', { name: 'Velocity key at 0.00 seconds', exact: true }).press('Enter'); await speed(page, '0');
  const after = await state(page);
  expect(after.project.tracks).toEqual(original.tracks);
  expect(after.project.velocities[0].keys.map((key: { speed: number }) => key.speed)).toEqual([0, 2]);
  expect(await page.evaluate(async () => {
    const p = '/src/core/project.ts', s = '/src/core/store.ts';
    return (await import(p)).sample((await import(s)).studio.get().project, 'model', 'position', 2)[0];
  })).toBeCloseTo(1);
  const rail = (await page.getByLabel('Velocity track', { exact: true }).boundingBox())!;
  const ruler = (await page.locator('.ruler-ticks').boundingBox())!;
  expect(rail.x).toBeCloseTo(ruler.x, 0); expect(rail.width).toBeCloseTo(ruler.width, 0);
  const key = page.getByRole('button', { name: 'Velocity key at 4.00 seconds', exact: true });
  const bounds = (await key.boundingBox())!;
  const undoCount = after.undoCount;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - rail.width / 4, bounds.y + bounds.height / 2 - 8, { steps: 8 }); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Velocity key at 3.00 seconds', exact: true })).toBeVisible();
  expect((await state(page)).undoCount).toBe(undoCount + 1);
  expect((await state(page)).time).toBe(3);
  await page.keyboard.press('Control+z');
  expect((await state(page)).project.velocities).toEqual(after.project.velocities);
  await page.getByRole('button', { name: 'Velocity key at 4.00 seconds', exact: true }).press('Enter');
  await page.getByLabel('Velocity key time', { exact: true }).fill('3.5'); await page.getByLabel('Velocity key time', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Velocity key at 3.50 seconds', exact: true }).press('Delete');
  await expect(page.locator('.velocity-key')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.velocity-key')).toHaveCount(2);
  const saved = (await state(page)).project;
  await page.evaluate(async () => { const path = '/src/core/store.ts'; (await import(path)).studio.persistNow(); });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('take-one-scene-v1')!).velocities)).toEqual(saved.velocities);
  await page.getByRole('button', { name: 'Velocity timeline mode' }).click();
  await page.reload(); await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await page.getByRole('button', { name: 'Velocity timeline mode' }).click();
  expect((await state(page)).project.velocities).toEqual(saved.velocities);
  await page.getByRole('button', { name: 'Velocity key at 3.50 seconds', exact: true }).press('Enter');
  expect((await state(page)).project.tracks).toEqual(original.tracks);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `test-results/velocity-${width}.png` });
  expect(errors).toEqual([]);
});

test('velocity keys use displayed scene time inside stretched clips and keep transform keys separate', async ({ page }) => {
  const original = await setup(page, true);
  await page.getByLabel('Timeline playhead', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Add velocity key', exact: true }).click(); await speed(page, '2');
  const s = await state(page);
  expect(s.time).toBe(4);
  expect(s.project.clips[0].velocityKeys[0]).toMatchObject({ time: 2, speed: 2 });
  expect(s.project.clips[0].tracks).toEqual(original.clips![0].tracks);
  await page.getByRole('button', { name: 'Velocity key at 3.00 seconds', exact: true }).press('ArrowLeft');
  expect((await state(page)).time).toBeCloseTo(4 - 1 / 30);
  await page.getByRole('button', { name: 'Delete selected velocity keyframe' }).click();
  await expect(page.locator('.velocity-key')).toHaveCount(0);
});
