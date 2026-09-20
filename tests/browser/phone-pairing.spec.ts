import { expect, test, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import jsQR from 'jsqr';
import { phonePairingCodeSchema } from '../../src/core/phonePairing';

async function openPairing(page: Page) {
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Phone camera', exact: true }).click();
  await page.getByRole('button', { name: 'Pair iPhone', exact: true }).click();
  await expect(page.getByRole('img', { name: 'iPhone pairing QR code' })).toBeVisible();
}

async function readQR(page: Page) {
  const pixels = await page.getByRole('img', { name: 'iPhone pairing QR code' }).evaluate(async svg => {
    const image = new Image(); image.src = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(svg))}`;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 432; canvas.height = 432;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 432, 432);
    return Array.from(context.getImageData(0, 0, 432, 432).data);
  });
  const decoded = jsQR(new Uint8ClampedArray(pixels), 432, 432);
  expect(decoded, 'the actual rendered QR must decode').not.toBeNull();
  return phonePairingCodeSchema.parse(JSON.parse(decoded!.data));
}

test('scannable local QR pairs through the existing relay and renewal revokes the old code', async ({ page }) => {
  await openPairing(page);
  const first = await readQR(page);
  expect(first.code).toBe(await page.locator('.phone-pairing strong').innerText());
  expect(first.address).toBe(await page.getByRole('combobox', { name: 'Pairing connection address' }).inputValue());
  expect(first.expiresAt).toBeGreaterThan(Date.now());
  await page.screenshot({ path: 'test-results/phone-pairing-qr.png', fullPage: true });
  await page.getByRole('button', { name: 'New pairing code' }).click();
  await expect(page.getByRole('img', { name: 'iPhone pairing QR code' })).toBeVisible();
  await expect(page.locator('.phone-pairing strong')).not.toHaveText(first.code);
  const next = await readQR(page);
  expect(next.code).not.toBe(first.code);
  const rejected = new WebSocket(`ws://127.0.0.1:3004/phone?code=${first.code}`);
  expect((await new Promise<Error>(resolve => rejected.once('error', resolve))).message).toContain('403');
  // The test relay binds to loopback; hardware uses the address decoded above.
  const sender = new WebSocket(`ws://127.0.0.1:3004/phone?code=${next.code}`);
  try {
    await once(sender, 'open');
    await expect(page.getByText('iPhone paired. Camera images stay on your phone.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'iPhone pairing QR code' })).toBeHidden();
  } finally { sender.close(); }
});

test('switching the address updates the QR and expired QR codes are replaced with a renewal action', async ({ page }) => {
  await page.route('**/api/phone/session', async route => {
    const response = await route.fetch(), pairing = await response.json();
    await route.fulfill({ response, json: { ...pairing, addresses: ['192.168.2.20:3003', '169.254.20.144:3003'] } });
  });
  await openPairing(page);
  const first = await readQR(page);
  await page.getByRole('combobox', { name: 'Pairing connection address' }).selectOption('169.254.20.144:3003');
  const wired = await readQR(page);
  expect(wired).toEqual({ ...first, address: '169.254.20.144:3003' });
  await page.clock.install();
  await page.clock.fastForward(10 * 60_000 + 1000);
  await expect(page.getByRole('img', { name: 'iPhone pairing QR code' })).toBeHidden();
  await expect(page.getByText('Pairing code expired. Generate a new code to connect.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New pairing code' })).toBeEnabled();
});
