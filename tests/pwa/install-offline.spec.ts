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
  const touchIcons = await page.locator('link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => ({
      href: (link as HTMLLinkElement).getAttribute('href'),
      sizes: (link as HTMLLinkElement).getAttribute('sizes'),
    })),
  );
  expect(touchIcons).toContainEqual({ href: '/Leafmark/apple-touch-icon-167.png', sizes: '167x167' });
  const ipadTouchIcon = await page.request.get(
    new URL('/Leafmark/apple-touch-icon-167.png', page.url()).toString(),
  );
  expect(ipadTouchIcon.ok()).toBe(true);
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
