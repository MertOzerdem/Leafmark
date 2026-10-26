import { expect, test } from '@playwright/test';

test('local readers switch isolated journals, restore after reload, and see persistent-storage status', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__leafmarkStorageCalls', { value: calls, configurable: true });

    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query.includes('display-mode: standalone')) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent: () => false,
        } satisfies MediaQueryList;
      }
      return nativeMatchMedia(query);
    }) as typeof window.matchMedia;

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => {
          calls.push('persisted');
          return false;
        },
        persist: async () => {
          calls.push('persist');
          return true;
        },
      },
    });
  });

  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await expect(page.getByText('Your reading life, gathered in one place.')).toBeVisible();
  await expect(page.getByTestId('storage-status')).toHaveText('Persistent storage is enabled for this iPad.');
  expect(await page.evaluate(() => (window as unknown as { __leafmarkStorageCalls: string[] }).__leafmarkStorageCalls))
    .toEqual(['persisted', 'persist']);

  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-ivy');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Local shelf for reader-ivy')).toBeVisible();

  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill('The Memory of Flowers');
  await page.getByLabel('Authors').fill('A. Reader');
  await page.getByLabel('Categories').fill('Historical Romance');
  await page.getByLabel('Page count').fill('320');
  await page.getByRole('button', { name: 'Save to TBR' }).click();
  await expect(page.getByText('The Memory of Flowers', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Your reading life, gathered in one place.')).toBeVisible();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-sage');
  await page.getByLabel('Password', { exact: true }).fill('another safe password');
  await page.getByLabel('Confirm password', { exact: true }).fill('another safe password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Local shelf for reader-sage')).toBeVisible();

  await page.getByRole('button', { name: 'Open TBR' }).click();
  await expect(page.getByText('Your list is empty. Search for a book or add one manually.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Welcome back, reader-sage.')).toBeVisible();
  await expect(page.getByTestId('storage-status')).toHaveText('Persistent storage is enabled for this iPad.');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-ivy');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Local shelf for reader-ivy')).toBeVisible();
  await page.getByRole('button', { name: 'Open TBR' }).click();
  await expect(page.getByText('The Memory of Flowers', { exact: true })).toBeVisible();

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Welcome back, reader-ivy.')).toBeVisible();
  await page.getByRole('button', { name: 'Open TBR' }).click();
  await expect(page.getByText('The Memory of Flowers', { exact: true })).toBeVisible();
  await page.context().setOffline(false);
});
