import { expect, test } from '@playwright/test';
import { makeProject, putKey } from '../../src/core/project';

for (const width of [1440, 390]) test(`themed dropdowns and neutral focus have room around the timeline at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const project = putKey(putKey(makeProject(), 'model', 'position', 0, [0, 0, 0]), 'model', 'position', 4, [1, 0, 0]);
  await page.addInitScript(value => localStorage.setItem('take-one-scene-v1', JSON.stringify(value)), project);
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Animate', exact: true }).click();
  const mode = page.getByLabel('Timeline mode', { exact: true });
  expect(await mode.evaluate(element => getComputedStyle(element).appearance)).toBe('base-select');
  await mode.click();
  await expect(page.getByRole('option', { name: 'Value graph', exact: true })).toBeVisible();
  const style = await mode.evaluate(element => {
    const picker = getComputedStyle(element, '::picker(select)'), option = getComputedStyle(element.querySelector('option')!);
    return { radius: picker.borderRadius, background: picker.backgroundColor, optionRadius: option.borderRadius, font: picker.fontFamily };
  });
  expect(style.radius).toBe('12px'); expect(style.optionRadius).toBe('8px'); expect(style.font).toContain('Manrope');
  const toolbar = (await page.locator('.timeline-toolbar').boundingBox())!, timeline = (await page.locator('.timeline-panel').boundingBox())!;
  const bottomTools = (await page.locator('.viewport-bottom').boundingBox())!;
  expect(timeline.y - bottomTools.y - bottomTools.height).toBeGreaterThanOrEqual(22);
  expect(toolbar.height).toBeGreaterThanOrEqual(54);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(await page.locator('.timeline-toolbar').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/timeline-theme-${width}.png` });
  await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  const focus = await mode.evaluate(element => {
    const probe = document.createElement('span'); probe.style.color = 'var(--faint)'; document.body.append(probe);
    const result = { color: getComputedStyle(element).outlineColor, neutral: getComputedStyle(probe).color }; probe.remove(); return result;
  });
  expect(focus.color).toBe(focus.neutral);
  await mode.press('Space'); await page.getByRole('option', { name: 'Velocity', exact: true }).click();
  await expect(mode).toHaveValue('velocity');
  expect(await page.evaluate(async () => { const path = '/src/core/store.ts'; return (await import(path)).studio.get().playing; })).toBe(false);
  await mode.selectOption('keys');
  const duration = page.getByLabel('Timeline duration', { exact: true }); await duration.click();
  await expect(page.getByRole('option', { name: '10 s', exact: true })).toBeVisible();
  await page.getByRole('option', { name: '10 s', exact: true }).click(); await expect(duration).toHaveValue('10');
});
