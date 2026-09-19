import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Generated frames exercise native MediaStream playback without depending on a webcam.
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const context = canvas.getContext('2d')!;
      let frame = 0;
      const draw = () => { context.fillStyle = '#c1c9c3'; context.fillRect(0, 0, 640, 480); context.fillStyle = '#e7e4db'; context.fillRect(frame++ % 600, 40, 40, 400); };
      draw(); const stream = canvas.captureStream(15), timer = setInterval(draw, 65);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      return stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const diagnostics = await page.getByLabel('Live camera preview').evaluate(node => {
    const video = node as HTMLVideoElement;
    return { readyState: video.readyState, paused: video.paused, error: video.error?.message, hidden: video.hidden, visibility: document.visibilityState,
      tracks: (video.srcObject as MediaStream | null)?.getTracks().map(track => ({ label: track.label, state: track.readyState, muted: track.muted, settings: track.getSettings() })) };
  });
  console.log('Camera test diagnostics:', diagnostics);
});

test('camera overlay starts, prevents guide capture, and releases the camera when switching views', async ({ page }) => {
  await page.goto('/#editor');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  const video = page.getByLabel('Live camera preview');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  const track = await video.evaluateHandle(node => ((node as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0]);
  await expect(page.getByRole('button', { name: 'Place in room', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Mirror camera', exact: true }).check();
  await expect(video).toHaveClass(/mirrored/);
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create preview', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop camera / AR', exact: true }).click();
  await expect(video).toBeHidden();
  expect(await track.evaluate(value => value.readyState)).toBe('ended');
  expect(await video.evaluate(node => (node as HTMLVideoElement).srcObject)).toBeNull();
  await expect(page.getByRole('button', { name: 'Create preview', exact: true })).toBeEnabled();
});

test('camera denial is actionable and leaves the editor usable', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  await page.goto('/#editor');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Allow camera access for this site');
  await expect(page.getByRole('button', { name: 'Retry camera', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Live camera preview')).toBeHidden();
  await page.getByRole('button', { name: 'Orbit', exact: true }).click();
  await page.getByRole('button', { name: 'Mannequin', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Pose controls' })).toBeVisible();
});

test('entering the scene camera from its inspector releases the webcam overlay', async ({ page }) => {
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  const video = page.getByLabel('Live camera preview'); await expect(video).toBeVisible();
  const track = await video.evaluateHandle(node => ((node as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0]);
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add camera', exact: true }).click();
  await page.getByRole('button', { name: 'Close objects panel', exact: true }).click();
  await page.getByRole('complementary', { name: 'Pose controls' }).getByRole('button', { name: 'Camera view', exact: true }).click();
  await expect(page.getByLabel('Camera frame', { exact: true })).toBeVisible(); await expect(video).toBeHidden();
  expect(await track.evaluate(value => value.readyState)).toBe('ended');
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create preview', exact: true })).toBeEnabled();
});

test('canceling a pending request closes a camera that is subsequently granted', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const state = window as unknown as { grantCamera: () => void; grantedTrack: MediaStreamTrack };
    navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => {
      state.grantCamera = () => { void original(constraints).then(stream => { state.grantedTrack = stream.getVideoTracks()[0]; resolve(stream); }); };
    });
  });
  await page.goto('/#editor');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel camera / AR', exact: true }).click();
  await page.evaluate(() => (window as unknown as { grantCamera: () => void }).grantCamera());
  await expect.poll(() => page.evaluate(() => (window as unknown as { grantedTrack?: MediaStreamTrack }).grantedTrack?.readyState)).toBe('ended');
  await expect(page.getByLabel('Live camera preview')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeEnabled();
});

test('loading the prepared animation demo releases an active webcam overlay', async ({ page }) => {
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  const video = page.getByLabel('Live camera preview'); await expect(video).toBeVisible();
  const track = await video.evaluateHandle(node => ((node as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0]);
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  await page.getByRole('button', { name: 'Animations', exact: true }).click();
  await page.getByRole('button', { name: 'Load Spider-Man demo', exact: true }).click();
  await expect(page.getByLabel('Camera frame', { exact: true })).toBeVisible(); await expect(video).toBeHidden();
  expect(await track.evaluate(value => value.readyState)).toBe('ended');
});

test('camera controls fit a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/#editor');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByLabel('Live camera preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop camera / AR', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ar-mobile.png' });
  await page.getByRole('button', { name: 'Stop camera / AR', exact: true }).click();
});
