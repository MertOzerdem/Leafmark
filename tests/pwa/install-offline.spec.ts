import { expect, test } from '@playwright/test';

test('the iPad Home Screen app opens its cached Leafmark shell offline', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'A reading journal that stays on this iPad.' })).toBeVisible();
  await expect(page.getByText('Open Leafmark in Safari, tap Share, then choose Add to Home Screen.')).toBeVisible();
  await expect(page.getByText('Connect to the internet for the first visit and app updates.')).toBeVisible();

  const manifest = await page.evaluate(async () => {
    const response = await fetch(new URL('manifest.webmanifest', document.baseURI));
    return response.json() as Promise<{ name: string; start_url: string; display: string }>;
  });
  expect(manifest.name).toBe('Leafmark');
  expect(manifest.start_url).toContain('/Leafmark/');
  expect(manifest.display).toBe('standalone');

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A reading journal that stays on this iPad.' })).toBeVisible();
  await expect(page.getByText('Your journal opens offline after the first visit.')).toBeVisible();
});
