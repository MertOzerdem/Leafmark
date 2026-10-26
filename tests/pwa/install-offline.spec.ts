import { expect, test } from '@playwright/test';

test('the iPad Home Screen app opens its cached Leafmark shell offline', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'A reading journal that stays on this iPad.' })).toBeVisible();
  await expect(page.getByText('Open Leafmark in Safari, tap Share, then choose Add to Home Screen.')).toBeVisible();
  await expect(page.getByText('Connect to the internet for the first visit and app updates.')).toBeVisible();

  const manifest = await page.evaluate(async () => {
    const response = await fetch(new URL('manifest.webmanifest', document.baseURI));
    return response.json() as Promise<{
      name: string;
      start_url: string;
      display: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    }>;
  });
  expect(manifest.name).toBe('Leafmark');
  expect(manifest.start_url).toContain('/Leafmark/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons[0]).toMatchObject({
    src: '/Leafmark/leafmark-icon.png',
    sizes: '1024x1024',
    type: 'image/png',
  });
  const iconResponse = await page.request.get(new URL(manifest.icons[0].src, page.url()).toString());
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()['content-type']).toContain('image/png');
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe(
    '/Leafmark/leafmark-icon.png',
  );
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(favicon).toBe('/Leafmark/favicon.ico');

  const precache = await page.evaluate(async () => {
    const response = await fetch(new URL('precache-manifest.json', document.baseURI));
    return response.json() as Promise<{ version: string }>;
  });
  const serviceWorker = await page.request.get(new URL('sw.js', page.url()).toString());
  expect(await serviceWorker.text()).toContain(`const cacheName = 'leafmark-shell-${precache.version}'`);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A reading journal that stays on this iPad.' })).toBeVisible();
  await expect(page.getByText('Your journal opens offline after the first visit.')).toBeVisible();
});
