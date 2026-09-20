import { expect, test, type Page } from '@playwright/test';

async function cameraState(page: Page) {
  return page.evaluate(async () => {
    const module = '/src/core/store.ts'; const { studio } = await import(module);
    return structuredClone(studio.get());
  });
}
async function ready(page: Page) { await page.goto('/#editor'); await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false'); }

test('camera view moves the saved camera, supports keyframes and reload, and keeps scene navigation separate', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const cameraSwitch = page.locator('.camera-switch');
  await expect(cameraSwitch.getByRole('button')).toHaveText(['Orbit', 'Camera view']);
  await expect(page.getByRole('button', { name: 'Phone camera', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AR', exact: true })).toHaveCount(0);
  await cameraSwitch.getByRole('button', { name: 'Camera view', exact: true }).click();
  await expect(page.getByLabel('Camera frame', { exact: true })).toBeVisible();
  const initial = await cameraState(page);
  expect(initial.project.camera).toBeDefined();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(350); await page.keyboard.up('KeyW');
  const moved = await cameraState(page);
  expect(moved.project.tracks.find((t: any) => t.objectId === '__shot_camera__' && t.channel === 'position').keys[0].value).not.toEqual(initial.project.camera.position);
  await page.getByRole('button', { name: 'Scene menu', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await cameraState(page)).project.tracks).toEqual(initial.project.tracks);
  await page.getByRole('button', { name: 'Scene menu', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Camera animation timeline' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Animated object' })).toHaveValue('__shot_camera__');
  await page.getByRole('slider', { name: 'Timeline playhead' }).fill('5');
  await page.locator('.camera-switch').getByRole('button', { name: 'Camera view', exact: true }).click();
  await page.keyboard.down('KeyD'); await page.waitForTimeout(350); await page.keyboard.up('KeyD');
  const keyed = await cameraState(page);
  expect(keyed.project.tracks.find((t: any) => t.channel === 'position').keys.map((k: any) => k.time)).toEqual([0, 5]);
  await page.locator('.camera-switch').getByRole('button', { name: 'Orbit', exact: true }).click();
  const canvas = page.getByLabel('Interactive 3D character viewport'); const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .5); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .6, { steps: 6 }); await page.mouse.up();
  expect((await cameraState(page)).project).toEqual(keyed.project);
  await page.reload(); await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  expect((await cameraState(page)).project).toEqual(keyed.project);
  await page.locator('.camera-switch').getByRole('button', { name: 'Camera view', exact: true }).click();
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await page.screenshot({ path: 'test-results/shot-camera-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('camera is selectable without scale controls, deletable and undoable', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add camera', exact: true }).click();
  await page.getByRole('button', { name: 'Close objects panel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set camera from this view', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scale model', exact: true })).toHaveCount(0);
  await page.keyboard.press('Delete');
  expect((await cameraState(page)).project.camera).toBeUndefined();
  await page.getByRole('button', { name: 'Scene menu', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await cameraState(page)).project.camera).toBeDefined();
});

test('mobile camera gate has the same aspect and stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
  await page.locator('.camera-switch').getByRole('button', { name: 'Camera view', exact: true }).click();
  const frame = (await page.getByLabel('Camera frame', { exact: true }).boundingBox())!;
  expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1);
  expect(frame.x).toBeGreaterThanOrEqual(0); expect(frame.x + frame.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/shot-camera-mobile.png', fullPage: true });
});

test('scroll resizes the camera preview without changing the saved composition', async ({ page }) => {
  await ready(page);
  await page.locator('.camera-switch').getByRole('button', { name: 'Camera view', exact: true }).click();
  const frame = page.getByLabel('Camera frame', { exact: true }), canvas = page.getByLabel('Interactive 3D character viewport');
  const initialBounds = (await frame.boundingBox())!, initialProject = (await cameraState(page)).project;
  await canvas.hover(); await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeLessThan(initialBounds.width * .7);
  const smallerBounds = (await frame.boundingBox())!;
  expect(smallerBounds.width / smallerBounds.height).toBeCloseTo(16 / 9, 1);
  expect((await cameraState(page)).project).toEqual(initialProject);
  const canvasBounds = (await canvas.boundingBox())!;
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2, canvasBounds.y + canvasBounds.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2 + 120, canvasBounds.y + canvasBounds.height / 2 - 80, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => (await frame.boundingBox())!.x).toBeGreaterThan(smallerBounds.x + 100);
  await expect.poll(async () => (await frame.boundingBox())!.y).toBeLessThan(smallerBounds.y - 60);
  expect((await cameraState(page)).project).toEqual(initialProject);
  await page.getByRole('button', { name: 'Reset camera preview', exact: true }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeCloseTo(initialBounds.width, 0);
  const resetBounds = (await frame.boundingBox())!;
  expect(resetBounds.x).toBeCloseTo(initialBounds.x, 0); expect(resetBounds.y).toBeCloseTo(initialBounds.y, 0);
  expect((await cameraState(page)).project).toEqual(initialProject);
});

test('camera-only projects retain a valid timeline selection through import and reload', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const corePath = '/src/core/project.ts', storePath = '/src/core/store.ts';
    const { makeProject, makeCamera } = await import(corePath); const { studio } = await import(storePath);
    studio.import(JSON.stringify({ ...makeProject(), objects: [], camera: makeCamera() }));
  });
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Camera animation timeline' })).toBeVisible();
  await page.getByRole('button', { name: 'Add key', exact: true }).click();
  expect((await cameraState(page)).project.tracks[0].objectId).toBe('__shot_camera__');
  await page.reload();
  expect((await cameraState(page)).objectId).toBe('__shot_camera__');
});

test('camera manual keys stay visible and open from the animation blocks timeline', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const corePath = '/src/core/project.ts', storePath = '/src/core/store.ts';
    const { makeProject, makeCamera, putKey, CAMERA_ID } = await import(corePath); const { studio } = await import(storePath);
    let project = { ...makeProject(), duration: 5, camera: makeCamera() };
    for (const time of [0, 2.5, 5]) {
      project = putKey(project, 'model', 'position', time, [time / 5, 1.3, 4], 'linear', undefined, CAMERA_ID);
      project = putKey(project, 'model', 'rotation', time, [0, time / 10, 0], 'linear', undefined, CAMERA_ID);
    }
    studio.import(JSON.stringify(project));
  });
  await page.getByRole('button', { name: 'Animations', exact: true }).click();
  await page.getByRole('button', { name: 'Add Drop to floor', exact: true }).click();
  await page.getByRole('button', { name: 'Close animations panel', exact: true }).click();
  const middleKey = page.getByRole('button', { name: 'Camera manual key at 2.50 seconds', exact: true });
  await expect(middleKey).toBeVisible();
  await middleKey.click();
  await expect(page.getByRole('region', { name: 'Camera animation timeline' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Animated object' })).toHaveValue('__shot_camera__');
  await expect(page.getByRole('slider', { name: 'Timeline playhead' })).toHaveValue('2.5');
  const deleteKey = page.getByRole('button', { name: 'Delete key', exact: true });
  await expect(deleteKey).toBeDisabled();
  await page.getByRole('button', { name: 'Position key at 2.50 seconds', exact: true }).click();
  await expect(deleteKey).toBeEnabled(); await deleteKey.click();
  const cameraTracks = (await cameraState(page)).project.tracks.filter((track: any) => track.objectId === '__shot_camera__');
  expect(cameraTracks.find((track: any) => track.channel === 'position').keys.map((key: any) => key.time)).toEqual([0, 5]);
  expect(cameraTracks.find((track: any) => track.channel === 'rotation').keys.map((key: any) => key.time)).toEqual([0, 2.5, 5]);
});

test('guide export replays the scene camera while the editor is in Orbit view', async ({ page }) => {
  test.setTimeout(120000);
  await ready(page);
  await page.evaluate(async () => {
    const corePath = '/src/core/project.ts', storePath = '/src/core/store.ts';
    const { makeProject, putKey, CAMERA_ID } = await import(corePath); const { studio } = await import(storePath);
    let project = { ...makeProject(), duration: 4, camera: { position: [0, 1.3, 4], rotation: [0, 0, 0] } };
    project = putKey(project, 'model', 'position', 0, [0, 1.3, 4], 'linear', undefined, CAMERA_ID);
    project = putKey(project, 'model', 'position', 4, [2, 1.3, 4], 'linear', undefined, CAMERA_ID);
    studio.import(JSON.stringify(project));
  });
  expect((await cameraState(page)).camera).toBe('orbit');
  await page.getByRole('button', { name: 'Scene menu', exact: true }).click();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  const guide = page.getByLabel('Guide preview', { exact: true });
  await expect(guide).toBeVisible({ timeout: 90000 });
  await expect.poll(() => guide.evaluate(node => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  const result = await guide.evaluate(async node => {
    const video = node as HTMLVideoElement, canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 90; const context = canvas.getContext('2d')!;
    async function pixels(time: number) {
      await new Promise<void>(resolve => { video.addEventListener('seeked', () => resolve(), { once: true }); video.currentTime = time; });
      context.drawImage(video, 0, 0, 160, 90); return context.getImageData(0, 0, 160, 90).data;
    }
    const first = await pixels(.1), last = await pixels(video.duration - .15);
    const difference = first.reduce((sum, value, index) => sum + Math.abs(value - last[index]), 0) / first.length;
    return { width: video.videoWidth, height: video.videoHeight, difference };
  });
  expect(result.width).toBe(1280); expect(result.height).toBe(720); expect(result.difference).toBeGreaterThan(.5);
});
